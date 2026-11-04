import {
  Flow,
  Step,
  ExecutionState,
  StepExecutionResult,
  ModelEndpointAdapter,
} from '../types/flow';
import { defaultModelAdapter } from './modelAdapter';
import { resolveTemplateDetailed } from './templateResolver';

export interface StepMetrics {
  promptCharCount: number;
  outputCharCount: number;
  /** Character count divided by 4. A rough proxy, not a tokenizer count. */
  estimatedPromptTokens: number;
  /** Character count divided by 4. A rough proxy, not a tokenizer count. */
  estimatedOutputTokens: number;
  totalEstimatedTokens: number;
  latencyMs: number;
}

export interface FlowRunnerOptions {
  adapter?: ModelEndpointAdapter;
  initialContext?: Record<string, string>;
  /**
   * When true, a step whose prompt has a placeholder with no value fails before any model is
   * called. The eval harness runs with this on. When false, the step runs and the unresolved
   * placeholders are listed in `step.warnings`.
   */
  strictPlaceholders?: boolean;
  onStateChange?: (state: ExecutionState, updatedFlow: Flow) => void;
  onStepStart?: (step: Step, stepIndex: number) => void;
  onStepComplete?: (
    step: Step,
    stepIndex: number,
    result: StepExecutionResult,
    metrics: StepMetrics
  ) => void;
  onStepError?: (step: Step, stepIndex: number, errorMessage: string) => void;
}

export interface FlowRunResult {
  state: ExecutionState;
  flow: Flow;
  metrics: {
    totalLatencyMs: number;
    totalPromptCharCount: number;
    totalOutputCharCount: number;
    totalEstimatedTokens: number;
    completedStepsCount: number;
    failedStepIndex?: number;
  };
}

/**
 * Deep clones a Flow object to prevent unintended state mutations during async execution.
 */
function cloneFlow(flow: Flow): Flow {
  return JSON.parse(JSON.stringify(flow));
}

/** Clears execution-only fields while preserving each step's prompt and model configuration. */
function invalidateStepResult(step: Step): void {
  step.status = 'idle';
  step.output = '';
  step.error = undefined;
  step.latencyMs = undefined;
  step.warnings = undefined;
}

/** Context keys that always mean the flow's own input. A step name or id can never claim them. */
const RESERVED_KEYS: ReadonlySet<string> = new Set(['input', 'initialInput']);
/** Keys that always mean "the output of step N". Only step N itself writes them. */
const INDEX_ALIAS = /^step\[?\d+\]?(?:\.output)?$/i;

/**
 * Populates context dictionary with alias keys for step outputs.
 *
 * Index aliases ({{step2.output}}, {{step[2]}}) always point at the step in that position.
 * Id and name aliases are added only when they do not collide: a step named "input" no longer
 * replaces the flow input, a step named "step1" no longer hijacks {{step1.output}}, and when two
 * steps share a name the first one keeps it.
 */
export function populateStepContext(
  context: Record<string, string>,
  step: Step,
  stepIndex: number,
  output: string
): void {
  const n = stepIndex + 1;

  // 1-based index aliases
  context[`step${n}.output`] = output;
  context[`step[${n}].output`] = output;
  context[`step${n}`] = output;
  context[`step[${n}]`] = output;

  const aliases: string[] = [];
  if (step.id) {
    aliases.push(
      `step[${step.id}].output`,
      `step_${step.id}.output`,
      `step${step.id}.output`,
      `${step.id}.output`,
      `step[${step.id}]`,
      step.id
    );
  }
  if (step.name) {
    aliases.push(`step_${step.name}.output`, `${step.name}.output`, `step_${step.name}`, step.name);
  }
  for (const key of aliases) {
    if (RESERVED_KEYS.has(key) || INDEX_ALIAS.test(key)) continue;
    if (Object.prototype.hasOwnProperty.call(context, key)) continue;
    context[key] = output;
  }
}

/** Returns the earlier step outputs that the prompt actually resolves through current aliases. */
function referencedStepIndexes(
  flow: Flow,
  stepIndex: number,
  availableStepIndexes: ReadonlySet<number>,
  initialContext: Record<string, string> = {}
): Set<number> {
  const context: Record<string, string> = {
    ...initialContext,
    input: flow.initialInput ?? '',
    initialInput: flow.initialInput ?? '',
  };
  let markerPrefix = '\u0000LMW_STEP_OUTPUT_';
  while (
    flow.steps.some((step) => step.prompt.includes(markerPrefix)) ||
    Object.values(context).some((value) => value.includes(markerPrefix))
  ) markerPrefix += '\u0000';
  const markers = new Map<number, string>();
  for (let index = 0; index < stepIndex; index++) {
    if (!availableStepIndexes.has(index)) continue;
    const marker = `${markerPrefix}${index}\u0000`;
    markers.set(index, marker);
    populateStepContext(context, flow.steps[index], index, marker);
  }

  const resolved = resolveTemplateDetailed(flow.steps[stepIndex].prompt, context).text;
  return new Set([...markers].flatMap(([index, marker]) => resolved.includes(marker) ? [index] : []));
}

/** Clears the target and only later steps whose prompts resolve to its output or descendants. */
function invalidateSingleStepDependents(
  flow: Flow,
  targetIndex: number,
  initialContext: Record<string, string> = {}
): void {
  const invalidated = new Set<number>([targetIndex]);
  for (let index = targetIndex + 1; index < flow.steps.length; index++) {
    // Match runSingleStep: only completed predecessors contribute aliases. The target and
    // already-invalidated descendants are included as prospective fresh outputs for transitivity.
    const availableStepIndexes = new Set<number>(invalidated);
    for (let priorIndex = 0; priorIndex < index; priorIndex++) {
      if (flow.steps[priorIndex].status === 'completed') availableStepIndexes.add(priorIndex);
    }
    const dependencies = referencedStepIndexes(flow, index, availableStepIndexes, initialContext);
    if ([...dependencies].some((dependency) => invalidated.has(dependency))) {
      invalidateStepResult(flow.steps[index]);
      invalidated.add(index);
    }
  }
}

/** The first step id that appears twice, or null. */
export function duplicateStepId(steps: Step[]): string | null {
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.id)) return step.id;
    seen.add(step.id);
  }
  return null;
}

interface StepOutcome {
  ok: boolean;
  latencyMs: number;
  promptCharCount: number;
  outputCharCount: number;
  totalTokens: number;
}

/**
 * Asynchronous Sequential Execution Engine for Linear Model Flows.
 */
export class FlowRunner {
  private adapter: ModelEndpointAdapter;

  constructor(adapter: ModelEndpointAdapter = defaultModelAdapter) {
    this.adapter = adapter;
  }

  /**
   * Runs one step: resolves its prompt, calls the adapter, records output or error.
   * Shared by runFlow and runSingleStep so the two paths cannot drift apart.
   */
  private async executeStep(
    step: Step,
    stepIndex: number,
    context: Record<string, string>,
    executionState: ExecutionState,
    updatedFlow: Flow,
    options: FlowRunnerOptions,
    adapter: ModelEndpointAdapter
  ): Promise<StepOutcome> {
    executionState.currentStepIndex = stepIndex;
    step.status = 'running';
    step.error = undefined;
    // A rerun must never leave the previous answer on screen looking current.
    step.output = '';
    step.latencyMs = undefined;
    step.warnings = undefined;

    const stepResult: StepExecutionResult = {
      stepId: step.id,
      stepName: step.name,
      status: 'running',
      output: '',
    };
    executionState.stepResults[step.id] = stepResult;

    options.onStepStart?.(step, stepIndex);
    options.onStateChange?.(executionState, updatedFlow);

    const { text: resolvedPrompt, unresolved } = resolveTemplateDetailed(step.prompt, context);
    const warnings = unresolved.map((key) => `Placeholder {{${key}}} has no value and was replaced with nothing.`);
    if (warnings.length > 0) {
      step.warnings = warnings;
      stepResult.warnings = warnings;
    }
    const promptCharCount = resolvedPrompt.length;
    const estimatedPromptTokens = Math.ceil(promptCharCount / 4);

    let calledAt: number | null = null;
    try {
      if (warnings.length > 0 && options.strictPlaceholders) {
        throw new Error(`Unresolved placeholder(s): ${unresolved.map((key) => `{{${key}}}`).join(', ')}`);
      }
      calledAt = performance.now();
      const result = await adapter.executePrompt(resolvedPrompt, step.modelConfig);

      step.status = 'completed';
      step.output = result.text;
      step.latencyMs = result.latencyMs;
      step.error = undefined;

      stepResult.status = 'completed';
      stepResult.output = result.text;
      stepResult.latencyMs = result.latencyMs;
      if (result.meta) stepResult.meta = result.meta;

      const outputCharCount = result.text.length;
      const estimatedOutputTokens = Math.ceil(outputCharCount / 4);
      const stepTotalTokens = estimatedPromptTokens + estimatedOutputTokens;

      populateStepContext(context, step, stepIndex, result.text);

      options.onStepComplete?.(step, stepIndex, stepResult, {
        promptCharCount,
        outputCharCount,
        estimatedPromptTokens,
        estimatedOutputTokens,
        totalEstimatedTokens: stepTotalTokens,
        latencyMs: result.latencyMs,
      });
      options.onStateChange?.(executionState, updatedFlow);
      return { ok: true, latencyMs: result.latencyMs, promptCharCount, outputCharCount, totalTokens: stepTotalTokens };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      step.status = 'error';
      step.error = errorMessage;

      stepResult.status = 'error';
      stepResult.error = errorMessage;
      // A failed request still took time. Keep it, so a timeout is visible as one.
      if (calledAt !== null) {
        step.latencyMs = Math.round(performance.now() - calledAt);
        stepResult.latencyMs = step.latencyMs;
      }

      executionState.status = 'error';
      executionState.error = errorMessage;
      executionState.endTime = Date.now();

      options.onStepError?.(step, stepIndex, errorMessage);
      options.onStateChange?.(executionState, updatedFlow);
      return { ok: false, latencyMs: 0, promptCharCount, outputCharCount: 0, totalTokens: 0 };
    }
  }

  private start(updatedFlow: Flow, options: FlowRunnerOptions, currentStepIndex: number) {
    const initialInput = updatedFlow.initialInput ?? '';
    const context: Record<string, string> = {
      ...(options.initialContext || {}),
      // The flow input always wins over a custom variable of the same name.
      input: initialInput,
      initialInput: initialInput,
    };
    const executionState: ExecutionState = {
      flowId: updatedFlow.id,
      status: 'running',
      currentStepIndex,
      context,
      stepResults: {},
      startTime: Date.now(),
    };
    return { context, executionState };
  }

  /** Marks the run as failed before any step starts, for flows that cannot run as written. */
  private refuse(executionState: ExecutionState, updatedFlow: Flow, options: FlowRunnerOptions, message: string): FlowRunResult {
    executionState.status = 'error';
    executionState.error = message;
    executionState.endTime = Date.now();
    options.onStateChange?.(executionState, updatedFlow);
    return {
      state: executionState,
      flow: updatedFlow,
      metrics: { totalLatencyMs: 0, totalPromptCharCount: 0, totalOutputCharCount: 0, totalEstimatedTokens: 0, completedStepsCount: 0 },
    };
  }

  /**
   * Executes all steps in a linear flow sequentially.
   */
  async runFlow(flow: Flow, options: FlowRunnerOptions = {}): Promise<FlowRunResult> {
    const activeAdapter = options.adapter || this.adapter;
    const updatedFlow = cloneFlow(flow);
    // A full run starts from fresh inputs, so no prior output may remain visible as current.
    updatedFlow.steps.forEach(invalidateStepResult);
    const { context, executionState } = this.start(updatedFlow, options, 0);

    const duplicate = duplicateStepId(updatedFlow.steps);
    if (duplicate !== null) {
      return this.refuse(executionState, updatedFlow, options, `Two steps share the id '${duplicate}'. Step ids must be unique.`);
    }

    let totalLatencyMs = 0;
    let totalPromptCharCount = 0;
    let totalOutputCharCount = 0;
    let totalEstimatedTokens = 0;
    let completedStepsCount = 0;
    let failedStepIndex: number | undefined = undefined;

    options.onStateChange?.(executionState, updatedFlow);

    for (let i = 0; i < updatedFlow.steps.length; i++) {
      const outcome = await this.executeStep(updatedFlow.steps[i], i, context, executionState, updatedFlow, options, activeAdapter);
      if (!outcome.ok) {
        failedStepIndex = i;
        break;
      }
      totalLatencyMs += outcome.latencyMs;
      totalPromptCharCount += outcome.promptCharCount;
      totalOutputCharCount += outcome.outputCharCount;
      totalEstimatedTokens += outcome.totalTokens;
      completedStepsCount++;
    }

    if (executionState.status !== 'error') {
      executionState.status = 'completed';
      executionState.endTime = Date.now();
      options.onStateChange?.(executionState, updatedFlow);
    }

    return {
      state: executionState,
      flow: updatedFlow,
      metrics: {
        totalLatencyMs,
        totalPromptCharCount,
        totalOutputCharCount,
        totalEstimatedTokens,
        completedStepsCount,
        failedStepIndex,
      },
    };
  }

  /**
   * Executes a single step within a flow individually.
   *
   * `stepIdOrIndex` is a step id, a 0-based index number, or a string of digits only. A string
   * such as "1garbage" is not read as index 1.
   */
  async runSingleStep(
    flow: Flow,
    stepIdOrIndex: string | number,
    options: FlowRunnerOptions = {}
  ): Promise<FlowRunResult> {
    const activeAdapter = options.adapter || this.adapter;
    const updatedFlow = cloneFlow(flow);

    let targetIndex = -1;
    if (typeof stepIdOrIndex === 'number') {
      targetIndex = Number.isInteger(stepIdOrIndex) ? stepIdOrIndex : -1;
    } else {
      const idx = updatedFlow.steps.findIndex((s) => s.id === stepIdOrIndex);
      if (idx !== -1) {
        targetIndex = idx;
      } else if (/^\d+$/.test(stepIdOrIndex.trim())) {
        targetIndex = Number(stepIdOrIndex.trim());
      }
    }

    if (targetIndex < 0 || targetIndex >= updatedFlow.steps.length) {
      throw new Error(`Step index/ID '${stepIdOrIndex}' not found in flow.`);
    }

    const { context, executionState } = this.start(updatedFlow, options, targetIndex);

    const duplicate = duplicateStepId(updatedFlow.steps);
    if (duplicate !== null) {
      return this.refuse(executionState, updatedFlow, options, `Two steps share the id '${duplicate}'. Step ids must be unique.`);
    }

    // Clear only later prompts that resolve to the rerun target or one of its descendants.
    // Alias resolution and collisions follow the same context population as execution.
    invalidateSingleStepDependents(updatedFlow, targetIndex, options.initialContext);

    // Earlier steps count as answered only when they completed. An idle or failed step has an
    // empty output, and treating it as an answer would hide the missing dependency. A completed
    // step that answered with empty text is still an answer.
    for (let i = 0; i < targetIndex; i++) {
      const priorStep = updatedFlow.steps[i];
      if (priorStep.status === 'completed') {
        populateStepContext(context, priorStep, i, priorStep.output ?? '');
      }
    }

    const outcome = await this.executeStep(updatedFlow.steps[targetIndex], targetIndex, context, executionState, updatedFlow, options, activeAdapter);
    if (outcome.ok) {
      executionState.status = 'completed';
      executionState.endTime = Date.now();
      options.onStateChange?.(executionState, updatedFlow);
    }

    return {
      state: executionState,
      flow: updatedFlow,
      metrics: {
        totalLatencyMs: outcome.latencyMs,
        totalPromptCharCount: outcome.promptCharCount,
        totalOutputCharCount: outcome.outputCharCount,
        totalEstimatedTokens: outcome.totalTokens,
        completedStepsCount: outcome.ok ? 1 : 0,
        failedStepIndex: outcome.ok ? undefined : targetIndex,
      },
    };
  }
}

export async function runFlow(
  flow: Flow,
  options: FlowRunnerOptions = {}
): Promise<FlowRunResult> {
  const runner = new FlowRunner(options.adapter);
  return runner.runFlow(flow, options);
}

export async function runSingleStep(
  flow: Flow,
  stepIdOrIndex: string | number,
  options: FlowRunnerOptions = {}
): Promise<FlowRunResult> {
  const runner = new FlowRunner(options.adapter);
  return runner.runSingleStep(flow, stepIdOrIndex, options);
}
