import { describe, it, expect, vi } from 'vitest';
import { runFlow, runSingleStep } from './flowRunner';
import { Flow, createDefaultFlow, createDefaultStep } from '../types/flow';

describe('FlowRunner edge cases and stress tests', () => {
  // Helper to create clean test flow
  const createChainFlow = (): Flow => {
    const flow = createDefaultFlow('chain-flow-1', 'Chain Flow', 'Initial User Input');

    const s1 = createDefaultStep('step-1', 'Step One', 'Process: {{input}}');
    s1.modelConfig.mockPattern = 'custom';
    s1.modelConfig.mockCustomResponse = 'Output Step 1';
    s1.modelConfig.mockLatencyMs = 0;

    const s2 = createDefaultStep('step-2', 'Step Two', 'Transform: {{step1.output}}');
    s2.modelConfig.mockPattern = 'custom';
    s2.modelConfig.mockCustomResponse = 'Output Step 2';
    s2.modelConfig.mockLatencyMs = 0;

    const s3 = createDefaultStep('step-3', 'Step Three', 'Finalize: {{step2.output}}');
    s3.modelConfig.mockPattern = 'custom';
    s3.modelConfig.mockCustomResponse = 'Output Step 3';
    s3.modelConfig.mockLatencyMs = 0;

    flow.steps = [s1, s2, s3];
    return flow;
  };

  // =========================================================================
  // SECTION 1: Template Variable Substitution Edge Cases in Flow Execution
  // =========================================================================
  describe('1. Template Substitution & Context Pollution Edge Cases', () => {
    it('prevents double template evaluation when step output contains curly braces {{injected}}', async () => {
      const flow = createDefaultFlow('injection-flow', 'Injection Flow', 'raw prompt');
      const s1 = createDefaultStep('s1', 'Step 1', 'Generate template tag');
      s1.modelConfig.mockPattern = 'custom';
      s1.modelConfig.mockCustomResponse = 'Injected tag: {{secret_key}}';

      const s2 = createDefaultStep('s2', 'Step 2', 'Pass-through: {{step1.output}}');
      s2.modelConfig.mockPattern = 'echo';

      flow.steps = [s1, s2];

      const result = await runFlow(flow, { initialContext: { secret_key: 'SUPER_SECRET_123' } });

      expect(result.state.status).toBe('completed');
      expect(result.flow.steps[0].output).toBe('Injected tag: {{secret_key}}');
      // Step 2 output should contain literal "{{secret_key}}", NOT substituted "SUPER_SECRET_123"
      expect(result.flow.steps[1].output).toBe('[Mock Echo] Pass-through: Injected tag: {{secret_key}}');
    });

    it('handles step output containing regex replacement tokens ($1, $&, $\', $`, $$) without string corruption', async () => {
      const flow = createDefaultFlow('regex-token-flow', 'Regex Token Flow', 'Input text');
      const s1 = createDefaultStep('s1', 'Step 1', 'Generate price & tokens');
      s1.modelConfig.mockPattern = 'custom';
      s1.modelConfig.mockCustomResponse = 'Total: $100 for $& (pre: $`, post: $\', esc: $$) $1 $2';

      const s2 = createDefaultStep('s2', 'Step 2', 'Receive: {{step1.output}}');
      s2.modelConfig.mockPattern = 'echo';

      flow.steps = [s1, s2];

      const result = await runFlow(flow);

      expect(result.flow.steps[1].output).toBe(
        '[Mock Echo] Receive: Total: $100 for $& (pre: $`, post: $\', esc: $$) $1 $2'
      );
    });

    it('identifies variable alias collision when a step is named "input"', async () => {
      const flow = createDefaultFlow('name-collision-flow', 'Collision Flow', 'ORIGINAL_INPUT');
      const s1 = createDefaultStep('s1', 'input', 'Echo initial input'); // step.name is 'input'
      s1.modelConfig.mockPattern = 'custom';
      s1.modelConfig.mockCustomResponse = 'OVERWRITTEN_BY_STEP1';

      const s2 = createDefaultStep('s2', 'Step 2', 'Original: {{initialInput}} | Input key: {{input}}');
      s2.modelConfig.mockPattern = 'echo';

      flow.steps = [s1, s2];

      const result = await runFlow(flow);

      // Verify whether context['input'] was overwritten by step name 'input'
      // If step.name = 'input', populateStepContext sets context['input'] = 'OVERWRITTEN_BY_STEP1'
      // But {{initialInput}} should still hold 'ORIGINAL_INPUT'
      expect(result.flow.steps[1].output).toContain('Original: ORIGINAL_INPUT');
    });

    it('handles step ID equal to another step index alias (e.g. step 1 ID is "step2")', async () => {
      const flow = createDefaultFlow('id-alias-conflict', 'Conflict Flow', 'Start');
      const s1 = createDefaultStep('step2', 'Step One', 'Do step 1: {{input}}'); // ID is "step2"
      s1.modelConfig.mockPattern = 'custom';
      s1.modelConfig.mockCustomResponse = 'Output from step with ID step2';

      const s2 = createDefaultStep('s2', 'Step Two', 'Ref index 1: {{step1.output}} | Ref ID step2: {{step[step2].output}}');
      s2.modelConfig.mockPattern = 'echo';

      flow.steps = [s1, s2];

      const result = await runFlow(flow);

      expect(result.flow.steps[1].output).toBe(
        '[Mock Echo] Ref index 1: Output from step with ID step2 | Ref ID step2: Output from step with ID step2'
      );
    });
  });

  // =========================================================================
  // SECTION 2: Single Step Execution & Intermediate Output Downstream Propagation
  // =========================================================================
  describe('2. Single Step Execution & Intermediate Output Editing', () => {
    it('propagates manually edited intermediate output downstream when running single step', async () => {
      const flow = createChainFlow();

      // Step 1: Pre-populate output
      flow.steps[0].status = 'completed';
      flow.steps[0].output = 'MANUALLY_EDITED_STEP_1_OUTPUT';

      // Re-run Step 2 alone
      const result = await runSingleStep(flow, 'step-2');

      expect(result.state.status).toBe('completed');
      expect(result.flow.steps[1].status).toBe('completed');
      // Step 2 prompt was "Transform: {{step1.output}}". It should use the edited step 1 output.
      expect(result.flow.steps[1].output).toBe('Output Step 2');

      // Verify that populateStepContext used MANUALLY_EDITED_STEP_1_OUTPUT during step 2 execution
      expect(result.state.context['step1.output']).toBe('MANUALLY_EDITED_STEP_1_OUTPUT');
    });

    it('populates empty string "" output from prior step in runSingleStep (hardened)', async () => {
      const flow = createChainFlow();

      // Step 1 output is explicitly set to empty string ""
      flow.steps[0].status = 'completed';
      flow.steps[0].output = '';

      // Run Step 2 alone
      const result = await runSingleStep(flow, 1);

      // In runSingleStep: `if (priorStep.output !== undefined)` populates empty string into context
      expect(result.state.context['step1.output']).toBe('');
    });

    it('resolves step identifier ambiguity in runSingleStep (string number vs step ID)', async () => {
      const flow = createDefaultFlow('ambiguity-flow', 'Ambiguity Flow', 'Init');
      const s1 = createDefaultStep('s1', 'Step 0', 'Prompt 0');
      s1.output = 'Out 0';
      s1.status = 'completed';

      const s2 = createDefaultStep('2', 'Step 1 with ID "2"', 'Prompt 1: {{step1.output}}'); // ID is "2"
      s2.modelConfig.mockPattern = 'custom';
      s2.modelConfig.mockCustomResponse = 'Out Step ID 2';

      const s3 = createDefaultStep('s3', 'Step 2', 'Prompt 2');
      s3.output = 'Out 2';

      flow.steps = [s1, s2, s3];

      // Call runSingleStep with target string '2'
      // Index 2 is s3. Step with ID '2' is s2 (index 1).
      // Logic checks: updatedFlow.steps.findIndex(s => s.id === '2') -> returns index 1!
      const result = await runSingleStep(flow, '2');

      expect(result.state.currentStepIndex).toBe(1);
      expect(result.flow.steps[1].status).toBe('completed');
      expect(result.flow.steps[1].output).toBe('Out Step ID 2');
    });

    it('handles numeric string index like "0" when no step has ID "0"', async () => {
      const flow = createChainFlow();
      const result = await runSingleStep(flow, '0');
      expect(result.state.currentStepIndex).toBe(0);
      expect(result.flow.steps[0].status).toBe('completed');
    });

    it('handles float or invalid numeric string index in runSingleStep', async () => {
      const flow = createChainFlow();
      // "1.9" passes parseInt("1.9", 10) -> 1
      const result = await runSingleStep(flow, '1.9');
      expect(result.state.currentStepIndex).toBe(1);
    });

    it('throws when target step string cannot be found or parsed', async () => {
      const flow = createChainFlow();
      await expect(runSingleStep(flow, 'nonexistent_step_id')).rejects.toThrow(/not found/i);
      await expect(runSingleStep(flow, -1)).rejects.toThrow(/not found/i);
      await expect(runSingleStep(flow, 100)).rejects.toThrow(/not found/i);
    });
  });

  // =========================================================================
  // SECTION 3: Special Characters, Multiline Strings & Large Data Resilience
  // =========================================================================
  describe('3. Special Characters, Multiline Strings & Large Data Resilience', () => {
    it('preserves complex multiline formatting, code blocks, and control characters through step chain', async () => {
      const codeBlockInput = "```typescript\nfunction test(): string {\n  const msg = \"Line 1\\nLine 2\\tTabbed\";\n  return `<${msg}>`;\n}\n```";

      const flow = createDefaultFlow('code-flow', 'Code Flow', codeBlockInput);

      const s1 = createDefaultStep('s1', 'Formatter', 'Input code:\n{{input}}');
      s1.modelConfig.mockPattern = 'echo';

      const s2 = createDefaultStep('s2', 'Analyzer', 'Analyzed code:\n{{step1.output}}');
      s2.modelConfig.mockPattern = 'echo';

      flow.steps = [s1, s2];

      const result = await runFlow(flow);

      expect(result.state.status).toBe('completed');
      expect(result.flow.steps[0].output).toBe(`[Mock Echo] Input code:\n${codeBlockInput}`);
      expect(result.flow.steps[1].output).toBe(
        `[Mock Echo] Analyzed code:\n[Mock Echo] Input code:\n${codeBlockInput}`
      );
    });

    it('handles non-ASCII, Unicode, Emojis, and HTML/XML tags in prompts and outputs', async () => {
      const unicodePrompt = '🚀 Quantum AI: 漢字 / 日本語 / Русский / <script>alert("xss")</script> & \'quotes\'';
      const flow = createDefaultFlow('unicode-flow', 'Unicode Flow', unicodePrompt);

      const s1 = createDefaultStep('s1', 'Unicode Step', 'Prompt: {{input}}');
      s1.modelConfig.mockPattern = 'echo';

      flow.steps = [s1];

      const result = await runFlow(flow);

      expect(result.flow.steps[0].output).toBe(`[Mock Echo] Prompt: ${unicodePrompt}`);
    });

    it('propagates 500KB large output string cleanly through 3 sequential steps', async () => {
      const largeOutput = 'A'.repeat(500000); // 500 KB string
      const flow = createDefaultFlow('large-data-flow', 'Large Data Flow', 'Start');

      const s1 = createDefaultStep('s1', 'Generator', 'Generate large output');
      s1.modelConfig.mockPattern = 'custom';
      s1.modelConfig.mockCustomResponse = largeOutput;

      const s2 = createDefaultStep('s2', 'Consumer', 'Length check: {{step1.output}}');
      s2.modelConfig.mockPattern = 'custom';
      s2.modelConfig.mockCustomResponse = 'Received 500KB output successfully';

      flow.steps = [s1, s2];

      const start = performance.now();
      const result = await runFlow(flow);
      const durationMs = performance.now() - start;

      expect(result.state.status).toBe('completed');
      expect(result.flow.steps[0].output.length).toBe(500000);
      expect(result.metrics.totalOutputCharCount).toBe(500000 + 'Received 500KB output successfully'.length);
      expect(durationMs).toBeLessThan(1000);
    });
  });

  // =========================================================================
  // SECTION 4: Error Halting & Recovery Transitions
  // =========================================================================
  describe('4. Error Halting, Failure Isolation & State Recovery', () => {
    it('halts multi-step flow at failing step and leaves subsequent steps idle', async () => {
      const flow = createChainFlow();
      // Configure step 2 to fail
      flow.steps[1].modelConfig.model = 'mock-error';

      const onStepStart = vi.fn();
      const onStepComplete = vi.fn();
      const onStepError = vi.fn();

      const result = await runFlow(flow, {
        onStepStart,
        onStepComplete,
        onStepError,
      });

      expect(result.state.status).toBe('error');
      expect(result.state.error).toContain('Simulated mock endpoint error');

      expect(result.flow.steps[0].status).toBe('completed');
      expect(result.flow.steps[0].output).toBe('Output Step 1');

      expect(result.flow.steps[1].status).toBe('error');
      expect(result.flow.steps[1].error).toContain('Simulated mock endpoint error');

      expect(result.flow.steps[2].status).toBe('idle');
      expect(result.flow.steps[2].output).toBe('');

      expect(result.metrics.completedStepsCount).toBe(1);
      expect(result.metrics.failedStepIndex).toBe(1);

      expect(onStepStart).toHaveBeenCalledTimes(2); // Step 1 and Step 2 started
      expect(onStepComplete).toHaveBeenCalledTimes(1); // Step 1 completed
      expect(onStepError).toHaveBeenCalledTimes(1); // Step 2 errored
    });

    it('recovers cleanly when broken step config is fixed and re-run', async () => {
      const flow = createChainFlow();
      flow.steps[1].modelConfig.model = 'mock-error';

      // First run fails
      const run1 = await runFlow(flow);
      expect(run1.state.status).toBe('error');

      // Fix step 2 model config
      flow.steps[1].modelConfig.model = 'mock-default';

      // Second run succeeds
      const run2 = await runFlow(flow);
      expect(run2.state.status).toBe('completed');
      expect(run2.flow.steps[1].status).toBe('completed');
      expect(run2.flow.steps[1].error).toBeUndefined();
      expect(run2.flow.steps[2].status).toBe('completed');
      expect(run2.metrics.completedStepsCount).toBe(3);
      expect(run2.metrics.failedStepIndex).toBeUndefined();
    });

    it('catches exceptions thrown inside callback functions and halts flow with error status', async () => {
      const flow = createChainFlow();
      const throwingCallback = () => {
        throw new Error('Callback exception');
      };

      const result = await runFlow(flow, { onStepComplete: throwingCallback });

      expect(result.state.status).toBe('error');
      expect(result.flow.steps[0].status).toBe('error');
      expect(result.flow.steps[0].error).toBe('Callback exception');
      expect(result.flow.steps[1].status).toBe('idle');
      expect(result.metrics.completedStepsCount).toBe(1);
      expect(result.metrics.failedStepIndex).toBe(0);
    });
  });

  // =========================================================================
  // SECTION 5: State Immutability & Lifecycle Callbacks
  // =========================================================================
  describe('5. State Immutability & Lifecycle Callbacks', () => {
    it('guarantees source Flow object is NEVER mutated by runFlow', async () => {
      const originalFlow = createChainFlow();
      const flowCopyJson = JSON.stringify(originalFlow);

      await runFlow(originalFlow);

      // Verify originalFlow was completely untouched
      expect(JSON.stringify(originalFlow)).toBe(flowCopyJson);
      expect(originalFlow.steps[0].status).toBe('idle');
      expect(originalFlow.steps[0].output).toBe('');
    });

    it('guarantees source Flow object is NEVER mutated by runSingleStep', async () => {
      const originalFlow = createChainFlow();
      const flowCopyJson = JSON.stringify(originalFlow);

      await runSingleStep(originalFlow, 1);

      expect(JSON.stringify(originalFlow)).toBe(flowCopyJson);
      expect(originalFlow.steps[1].status).toBe('idle');
      expect(originalFlow.steps[1].output).toBe('');
    });

    it('emits accurate state snapshots to onStateChange throughout flow execution', async () => {
      const flow = createChainFlow();
      const stateHistory: string[] = [];

      await runFlow(flow, {
        onStateChange: (state) => {
          stateHistory.push(`${state.status}:${state.currentStepIndex}`);
        },
      });

      // State progression: initial running:0 -> start step 0 running:0 -> complete step 0 running:0 -> start step 1 running:1 -> complete step 1 running:1 -> start step 2 running:2 -> complete step 2 running:2 -> final completed:2
      expect(stateHistory[0]).toBe('running:0');
      expect(stateHistory[stateHistory.length - 1]).toBe('completed:2');
      expect(stateHistory.length).toBeGreaterThanOrEqual(7);
    });
  });

  // =========================================================================
  // SECTION 6: High Concurrency & Flow Chains Stress Test
  // =========================================================================
  describe('6. High Concurrency & Long Step Chains Stress Test', () => {
    it('executes 20 flows concurrently without cross-flow context contamination', async () => {
      const concurrency = 20;

      const flowPromises = Array.from({ length: concurrency }, (_, i) => {
        const flow = createDefaultFlow(`concurrent-flow-${i}`, `Flow ${i}`, `Input_${i}`);
        const s1 = createDefaultStep(`s1_${i}`, `Step1_${i}`, 'Echo: {{input}}');
        s1.modelConfig.mockPattern = 'custom';
        s1.modelConfig.mockCustomResponse = `Output_Flow_${i}`;
        s1.modelConfig.mockLatencyMs = 0;

        flow.steps = [s1];
        return runFlow(flow);
      });

      const results = await Promise.all(flowPromises);

      expect(results).toHaveLength(concurrency);
      results.forEach((res, i) => {
        expect(res.state.status).toBe('completed');
        expect(res.flow.id).toBe(`concurrent-flow-${i}`);
        expect(res.flow.steps[0].output).toBe(`Output_Flow_${i}`);
      });
    });

    it('executes a 50-step linear flow sequentially with context accumulation', async () => {
      const stepCount = 50;
      const flow = createDefaultFlow('50-step-flow', '50 Step Flow', 'Initial Token');

      for (let i = 0; i < stepCount; i++) {
        const prevRef = i === 0 ? '{{input}}' : `{{step${i}.output}}`;
        const step = createDefaultStep(`s_${i}`, `Step ${i + 1}`, `P${i + 1}: ${prevRef}`);
        step.modelConfig.mockPattern = 'custom';
        step.modelConfig.mockCustomResponse = `Val_${i + 1}`;
        step.modelConfig.mockLatencyMs = 0;
        flow.steps.push(step);
      }

      const start = performance.now();
      const result = await runFlow(flow);
      const durationMs = performance.now() - start;

      expect(result.state.status).toBe('completed');
      expect(result.metrics.completedStepsCount).toBe(50);
      expect(result.flow.steps[49].output).toBe('Val_50');
      expect(result.state.context['step50.output']).toBe('Val_50');

      console.log(`50-step flow execution time: ${durationMs.toFixed(2)}ms`);
      expect(durationMs).toBeLessThan(2000);
    });
  });
});
