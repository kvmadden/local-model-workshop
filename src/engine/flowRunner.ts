import {
  Flow,
  Step,
  ExecutionState,
  StepExecutionResult,
  ModelEndpointAdapter,
} from '../types/flow';
import { defaultModelAdapter } from './modelAdapter';
import { resolveTemplate } from './templateResolver';

export interface StepMetrics {
  promptCharCount: number;
  outputCharCount: number;
  estimatedPromptTokens: number;
  estimatedOutputTokens: number;
  totalEstimatedTokens: number;
  latencyMs: number;
}

export interface FlowRunnerOptions {
  adapter?: ModelEndpointAdapter;
  initialContext?: Record<string, string>;
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

/**
 * Populates context dictionary with alias keys for step outputs.
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

  // Step ID aliases
  if (step.id) {
    context[`step[${step.id}].output`] = output;
    context[`step_${step.id}.output`] = output;
    context[`step${step.id}.output`] = output;
    context[`${step.id}.output`] = output;
    context[`step[${step.id}]`] = output;
    context[step.id] = output;
  }

  // Step Name aliases
  if (step.name) {
    context[`step_${step.name}.output`] = output;
    context[`${step.name}.output`] = output;
    context[`step_${step.name}`] = output;
    context[step.name] = output;
  }
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
   * Executes all steps in a linear flow sequentially.
   */
  async runFlow(flow: Flow, options: FlowRunnerOptions = {}): Promise<FlowRunResult> {
    const activeAdapter = options.adapter || this.adapter;
    const updatedFlow = cloneFlow(flow);

    const initialInput = updatedFlow.initialInput ?? '';
    const context: Record<string, string> = {
      input: initialInput,
      initialInput: initialInput,
      ...(options.initialContext || {}),
    };

    const startTime = Date.now();
    const executionState: ExecutionState = {
      flowId: updatedFlow.id,
      status: 'running',
      currentStepIndex: 0,
      context,
      stepResults: {},
      startTime,
    };

    let totalLatencyMs = 0;
    let totalPromptCharCount = 0;
    let totalOutputCharCount = 0;
    let totalEstimatedTokens = 0;
    let completedStepsCount = 0;
    let failedStepIndex: number | undefined = undefined;

    options.onStateChange?.(executionState, updatedFlow);

    for (let i = 0; i < updatedFlow.steps.length; i++) {
      const step = updatedFlow.steps[i];
      executionState.currentStepIndex = i;

      step.status = 'running';
      step.error = undefined;

      const stepResult: StepExecutionResult = {
        stepId: step.id,
        stepName: step.name,
        status: 'running',
        output: '',
      };
      executionState.stepResults[step.id] = stepResult;

      options.onStepStart?.(step, i);
      options.onStateChange?.(executionState, updatedFlow);

      const resolvedPrompt = resolveTemplate(step.prompt, context);
      const promptCharCount = resolvedPrompt.length;
      const estimatedPromptTokens = Math.ceil(promptCharCount / 4);

      try {
        const result = await activeAdapter.executePrompt(resolvedPrompt, step.modelConfig);

        step.status = 'completed';
        step.output = result.text;
        step.latencyMs = result.latencyMs;
        step.error = undefined;

        stepResult.status = 'completed';
        stepResult.output = result.text;
        stepResult.latencyMs = result.latencyMs;

        const outputCharCount = result.text.length;
        const estimatedOutputTokens = Math.ceil(outputCharCount / 4);
        const stepTotalTokens = estimatedPromptTokens + estimatedOutputTokens;

        const stepMetrics: StepMetrics = {
          promptCharCount,
          outputCharCount,
          estimatedPromptTokens,
          estimatedOutputTokens,
          totalEstimatedTokens: stepTotalTokens,
          latencyMs: result.latencyMs,
        };

        totalLatencyMs += result.latencyMs;
        totalPromptCharCount += promptCharCount;
        totalOutputCharCount += outputCharCount;
        totalEstimatedTokens += stepTotalTokens;
        completedStepsCount++;

        populateStepContext(context, step, i, result.text);

        options.onStepComplete?.(step, i, stepResult, stepMetrics);
        options.onStateChange?.(executionState, updatedFlow);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        step.status = 'error';
        step.error = errorMessage;

        stepResult.status = 'error';
        stepResult.error = errorMessage;

        executionState.status = 'error';
        executionState.error = errorMessage;
        executionState.endTime = Date.now();

        failedStepIndex = i;

        options.onStepError?.(step, i, errorMessage);
        options.onStateChange?.(executionState, updatedFlow);
        break;
      }
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
      targetIndex = stepIdOrIndex;
    } else {
      const idx = updatedFlow.steps.findIndex((s) => s.id === stepIdOrIndex);
      if (idx !== -1) {
        targetIndex = idx;
      } else {
        const numIdx = parseInt(stepIdOrIndex, 10);
        if (!isNaN(numIdx) && numIdx >= 0 && numIdx < updatedFlow.steps.length) {
          targetIndex = numIdx;
        }
      }
    }

    if (targetIndex < 0 || targetIndex >= updatedFlow.steps.length) {
      throw new Error(`Step index/ID '${stepIdOrIndex}' not found in flow.`);
    }

    const initialInput = updatedFlow.initialInput ?? '';
    const context: Record<string, string> = {
      input: initialInput,
      initialInput: initialInput,
      ...(options.initialContext || {}),
    };

    // Pre-populate context with outputs of preceding completed steps
    for (let i = 0; i < targetIndex; i++) {
      const priorStep = updatedFlow.steps[i];
      if (priorStep.output !== undefined) {
        populateStepContext(context, priorStep, i, priorStep.output);
      }
    }

    const startTime = Date.now();
    const executionState: ExecutionState = {
      flowId: updatedFlow.id,
      status: 'running',
      currentStepIndex: targetIndex,
      context,
      stepResults: {},
      startTime,
    };

    const targetStep = updatedFlow.steps[targetIndex];
    targetStep.status = 'running';
    targetStep.error = undefined;

    const stepResult: StepExecutionResult = {
      stepId: targetStep.id,
      stepName: targetStep.name,
      status: 'running',
      output: '',
    };
    executionState.stepResults[targetStep.id] = stepResult;

    options.onStepStart?.(targetStep, targetIndex);
    options.onStateChange?.(executionState, updatedFlow);

    const resolvedPrompt = resolveTemplate(targetStep.prompt, context);
    const promptCharCount = resolvedPrompt.length;
    const estimatedPromptTokens = Math.ceil(promptCharCount / 4);

    let totalLatencyMs = 0;
    let totalPromptCharCount = 0;
    let totalOutputCharCount = 0;
    let totalEstimatedTokens = 0;
    let completedStepsCount = 0;
    let failedStepIndex: number | undefined = undefined;

    try {
      const result = await activeAdapter.executePrompt(resolvedPrompt, targetStep.modelConfig);

      targetStep.status = 'completed';
      targetStep.output = result.text;
      targetStep.latencyMs = result.latencyMs;
      targetStep.error = undefined;

      stepResult.status = 'completed';
      stepResult.output = result.text;
      stepResult.latencyMs = result.latencyMs;

      const outputCharCount = result.text.length;
      const estimatedOutputTokens = Math.ceil(outputCharCount / 4);
      const stepTotalTokens = estimatedPromptTokens + estimatedOutputTokens;

      const stepMetrics: StepMetrics = {
        promptCharCount,
        outputCharCount,
        estimatedPromptTokens,
        estimatedOutputTokens,
        totalEstimatedTokens: stepTotalTokens,
        latencyMs: result.latencyMs,
      };

      totalLatencyMs = result.latencyMs;
      totalPromptCharCount = promptCharCount;
      totalOutputCharCount = outputCharCount;
      totalEstimatedTokens = stepTotalTokens;
      completedStepsCount = 1;

      populateStepContext(context, targetStep, targetIndex, result.text);

      options.onStepComplete?.(targetStep, targetIndex, stepResult, stepMetrics);

      executionState.status = 'completed';
      executionState.endTime = Date.now();
      options.onStateChange?.(executionState, updatedFlow);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      targetStep.status = 'error';
      targetStep.error = errorMessage;

      stepResult.status = 'error';
      stepResult.error = errorMessage;

      executionState.status = 'error';
      executionState.error = errorMessage;
      executionState.endTime = Date.now();

      failedStepIndex = targetIndex;

      options.onStepError?.(targetStep, targetIndex, errorMessage);
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
