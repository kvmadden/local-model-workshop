import { describe, it, expect, vi } from 'vitest';
import { runFlow, runSingleStep } from './flowRunner';
import { Flow, createDefaultFlow, createDefaultStep } from '../types/flow';

describe('FlowRunner — Asynchronous Execution Engine Suite', () => {
  const createTestFlow = (): Flow => {
    const flow = createDefaultFlow('test-flow-1', 'Test Flow', 'Initial User Context Prompt');
    const step1 = createDefaultStep('step-1', 'Summarize', 'Summarize this: {{input}}');
    step1.modelConfig.mockPattern = 'custom';
    step1.modelConfig.mockCustomResponse = 'Summary of user prompt';

    const step2 = createDefaultStep('step-2', 'Translate', 'Translate to French: {{step1.output}}');
    step2.modelConfig.mockPattern = 'custom';
    step2.modelConfig.mockCustomResponse = 'Résumé de la demande de l\'utilisateur';

    flow.steps = [step1, step2];
    return flow;
  };

  describe('1. Full Flow Execution (runFlow)', () => {
    it('executes a 2-step flow sequentially and resolves template context', async () => {
      const flow = createTestFlow();
      const result = await runFlow(flow);

      expect(result.state.status).toBe('completed');
      expect(result.flow.steps[0].status).toBe('completed');
      expect(result.flow.steps[0].output).toBe('Summary of user prompt');
      expect(result.flow.steps[1].status).toBe('completed');
      expect(result.flow.steps[1].output).toBe('Résumé de la demande de l\'utilisateur');

      expect(result.metrics.completedStepsCount).toBe(2);
      expect(result.metrics.failedStepIndex).toBeUndefined();
    });

    it('executes a 3-step chain propagating context through all steps', async () => {
      const flow = createDefaultFlow('3-step-flow', '3 Step Flow', 'Raw Data');
      const step1 = createDefaultStep('s1', 'Step 1', 'Extract: {{input}}');
      step1.modelConfig = { ...step1.modelConfig, mockPattern: 'custom', mockCustomResponse: 'Extracted Point A' };

      const step2 = createDefaultStep('s2', 'Step 2', 'Format: {{step1.output}}');
      step2.modelConfig = { ...step2.modelConfig, mockPattern: 'custom', mockCustomResponse: 'Formatted Point A' };

      const step3 = createDefaultStep('s3', 'Step 3', 'Final Output: {{step2.output}} (Original: {{initialInput}})');
      step3.modelConfig = { ...step3.modelConfig, mockPattern: 'custom', mockCustomResponse: 'Final Output: Formatted Point A (Original: Raw Data)' };

      flow.steps = [step1, step2, step3];

      const result = await runFlow(flow);

      expect(result.state.status).toBe('completed');
      expect(result.flow.steps[2].output).toBe('Final Output: Formatted Point A (Original: Raw Data)');
      expect(result.metrics.completedStepsCount).toBe(3);
    });

    it('preserves multiline strings and special characters across step execution', async () => {
      const multilineInput = "Line 1: Hello\nLine 2: \"World\"\nLine 3: <Tag> & 'Quotes'";
      const flow = createDefaultFlow('multiline-flow', 'Multiline Flow', multilineInput);

      const step1 = createDefaultStep('s1', 'Step 1', 'Echo input:\n{{input}}');
      step1.modelConfig = { ...step1.modelConfig, mockPattern: 'echo' };

      flow.steps = [step1];

      const result = await runFlow(flow);
      expect(result.flow.steps[0].output).toBe(`[Mock Echo] Echo input:\n${multilineInput}`);
    });
  });

  describe('2. Context Resolution & Variable Alias Formats', () => {
    it('resolves bracket notation {{step[id].output}} and 1-based index {{step[1].output}}', async () => {
      const flow = createDefaultFlow('alias-flow', 'Alias Flow', 'Base Input');
      const step1 = createDefaultStep('custom-id-999', 'First Step', 'Proc: {{input}}');
      step1.modelConfig = { ...step1.modelConfig, mockPattern: 'custom', mockCustomResponse: 'Output Alpha' };

      const step2 = createDefaultStep('step-2', 'Second Step', 'Bracket ID: {{step[custom-id-999].output}} | Bracket Index: {{step[1].output}}');
      step2.modelConfig = { ...step2.modelConfig, mockPattern: 'echo' };

      flow.steps = [step1, step2];

      const result = await runFlow(flow);
      expect(result.flow.steps[1].output).toBe('[Mock Echo] Bracket ID: Output Alpha | Bracket Index: Output Alpha');
    });

    it('resolves shorthand placeholders without .output ({{step1}}, {{step_name}})', async () => {
      const flow = createDefaultFlow('shorthand-flow', 'Shorthand Flow', 'User Text');
      const step1 = createDefaultStep('s1', 'analyze', 'Analyze: {{input}}');
      step1.modelConfig = { ...step1.modelConfig, mockPattern: 'custom', mockCustomResponse: 'Analysis Result' };

      const step2 = createDefaultStep('s2', 'Step 2', 'Short Index: {{step1}} | Short Name: {{analyze}}');
      step2.modelConfig = { ...step2.modelConfig, mockPattern: 'echo' };

      flow.steps = [step1, step2];

      const result = await runFlow(flow);
      expect(result.flow.steps[1].output).toBe('[Mock Echo] Short Index: Analysis Result | Short Name: Analysis Result');
    });
  });

  describe('3. Single Step Execution (runSingleStep)', () => {
    it('executes only the target step using prior cached step outputs', async () => {
      const flow = createTestFlow();
      // Simulate Step 1 already completed
      flow.steps[0].status = 'completed';
      flow.steps[0].output = 'Pre-cached step 1 output';

      const result = await runSingleStep(flow, 'step-2');

      expect(result.state.status).toBe('completed');
      expect(result.flow.steps[0].output).toBe('Pre-cached step 1 output');
      expect(result.flow.steps[1].status).toBe('completed');
      expect(result.flow.steps[1].output).toBe("Résumé de la demande de l'utilisateur");
      expect(result.metrics.completedStepsCount).toBe(1);
    });

    it('handles target step specified by numeric index or ID string', async () => {
      const flow = createTestFlow();
      flow.steps[0].output = 'Cached output';

      const resultByIndex = await runSingleStep(flow, 1);
      expect(resultByIndex.flow.steps[1].status).toBe('completed');

      const resultById = await runSingleStep(flow, 'step-2');
      expect(resultById.flow.steps[1].status).toBe('completed');
    });

    it('populates empty string "" output from preceding step into template context during runSingleStep', async () => {
      const flow = createDefaultFlow('empty-output-flow', 'Empty Output Flow', 'Input Text');
      const step1 = createDefaultStep('s1', 'Step 1', 'Step 1 Prompt');
      step1.status = 'completed';
      step1.output = '';

      const step2 = createDefaultStep('s2', 'Step 2', 'Step 2 Output: "{{step1.output}}"');
      step2.modelConfig = { ...step2.modelConfig, mockPattern: 'echo' };

      flow.steps = [step1, step2];

      const result = await runSingleStep(flow, 1);
      expect(result.flow.steps[1].status).toBe('completed');
      expect(result.flow.steps[1].output).toBe('[Mock Echo] Step 2 Output: ""');
    });

    it('throws error when target step index or ID is out of bounds', async () => {
      const flow = createTestFlow();
      await expect(runSingleStep(flow, 'non-existent-id')).rejects.toThrow(/not found/i);
      await expect(runSingleStep(flow, 99)).rejects.toThrow(/not found/i);
    });
  });

  describe('4. Execution Callbacks & State Transitions', () => {
    it('invokes callbacks in strict chronological order with accurate step status', async () => {
      const flow = createTestFlow();

      const onStepStart = vi.fn();
      const onStepComplete = vi.fn();
      const onStateChange = vi.fn();

      await runFlow(flow, {
        onStepStart,
        onStepComplete,
        onStateChange,
      });

      expect(onStepStart).toHaveBeenCalledTimes(2);
      expect(onStepComplete).toHaveBeenCalledTimes(2);
      expect(onStateChange.mock.calls.length).toBeGreaterThanOrEqual(4);

      // First step start
      expect(onStepStart.mock.calls[0][0].id).toBe('step-1');
      expect(onStepStart.mock.calls[0][1]).toBe(0);

      // First step complete
      expect(onStepComplete.mock.calls[0][0].id).toBe('step-1');
      expect(onStepComplete.mock.calls[0][1]).toBe(0);
      expect(onStepComplete.mock.calls[0][2].status).toBe('completed');
      expect(onStepComplete.mock.calls[0][3].latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('5. Latency & Token Metrics Tracking', () => {
    it('calculates step and flow latency, character count, and estimated tokens', async () => {
      const flow = createDefaultFlow('metrics-flow', 'Metrics Flow', 'Hello World');
      const step1 = createDefaultStep('s1', 'Step 1', 'Prompt: {{input}}'); // Prompt length = 19
      step1.modelConfig = {
        ...step1.modelConfig,
        mockPattern: 'custom',
        mockCustomResponse: '1234567890123456', // Output length = 16
        mockLatencyMs: 50,
      };

      flow.steps = [step1];

      const result = await runFlow(flow);

      expect(result.flow.steps[0].latencyMs).toBeGreaterThanOrEqual(50);
      expect(result.metrics.totalPromptCharCount).toBe(19);
      expect(result.metrics.totalOutputCharCount).toBe(16);
      expect(result.metrics.totalEstimatedTokens).toBe(
        Math.ceil(19 / 4) + Math.ceil(16 / 4) // 5 + 4 = 9
      );
    });
  });

  describe('6. Error Handling & Flow Halting', () => {
    it('halts execution on step error and updates flow/step status to error', async () => {
      const flow = createDefaultFlow('error-flow', 'Error Flow', 'Input Text');

      const step1 = createDefaultStep('s1', 'Step 1', 'Good step: {{input}}');
      step1.modelConfig = { ...step1.modelConfig, mockPattern: 'custom', mockCustomResponse: 'OK Output' };

      const step2 = createDefaultStep('s2', 'Step 2', 'Bad step');
      step2.modelConfig = { ...step2.modelConfig, model: 'mock-error' }; // Triggers error in MockEndpoint

      const step3 = createDefaultStep('s3', 'Step 3', 'Never runs');

      flow.steps = [step1, step2, step3];

      const onStepError = vi.fn();
      const result = await runFlow(flow, { onStepError });

      expect(result.state.status).toBe('error');
      expect(result.flow.steps[0].status).toBe('completed');
      expect(result.flow.steps[1].status).toBe('error');
      expect(result.flow.steps[1].error).toContain('Simulated mock endpoint error');
      expect(result.flow.steps[2].status).toBe('idle'); // Halted before running step 3

      expect(result.metrics.completedStepsCount).toBe(1);
      expect(result.metrics.failedStepIndex).toBe(1);

      expect(onStepError).toHaveBeenCalledTimes(1);
      expect(onStepError.mock.calls[0][0].id).toBe('s2');
      expect(onStepError.mock.calls[0][1]).toBe(1);
      expect(onStepError.mock.calls[0][2]).toContain('Simulated mock endpoint error');
    });
  });
});
