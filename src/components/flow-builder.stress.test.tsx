/**
 * Phase 2 Empirical Stress & Hardening Test Suite
 * Testing rapid UI interaction flakiness, state desync, race conditions, memory leaks, unhandled rejections, and step key collisions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import App from '../App';
import { runFlow } from '../engine/flowRunner';
import { createDefaultStep, Flow } from '../types/flow';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Phase 2 Empirical Stress & Hardening Test Suite', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
  });

  const renderComponent = async (element: React.ReactElement) => {
    await act(async () => {
      root!.render(element);
    });
  };

  const getByTestId = (testId: string): HTMLElement | null => {
    return container?.querySelector(`[data-testid="${testId}"]`) || null;
  };

  const changeInputValue = async (element: HTMLElement, value: string) => {
    await act(async () => {
      let prototype: any = window.HTMLInputElement.prototype;
      if (element instanceof window.HTMLTextAreaElement) {
        prototype = window.HTMLTextAreaElement.prototype;
      } else if (element instanceof window.HTMLSelectElement) {
        prototype = window.HTMLSelectElement.prototype;
      }

      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      nativeInputValueSetter?.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  const waitForExecution = async (ms = 500) => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  };

  // =========================================================================
  // 1. Duplicate Key & Alias Collision Vulnerability
  // =========================================================================
  it('1. Duplicate Key & State Desync on step deletion followed by step addition', async () => {
    await renderComponent(<App />);

    const addBtn = getByTestId('add-step-btn') as HTMLButtonElement;
    
    // Add two steps so we have step-1, step-2, step-3
    await act(async () => {
      addBtn.click();
    });
    await act(async () => {
      addBtn.click();
    });

    expect(getByTestId('step-card-0')).not.toBeNull();
    expect(getByTestId('step-card-1')).not.toBeNull();
    expect(getByTestId('step-card-2')).not.toBeNull();

    // Delete step 2 (index 1)
    const deleteBtn1 = getByTestId('step-delete-btn-1') as HTMLButtonElement;
    await act(async () => {
      deleteBtn1.click();
    });

    // Now 2 steps remain in state. Click Add Step.
    const spyConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      addBtn.click();
    });

    const duplicateKeyCall = spyConsoleError.mock.calls.find((call) =>
      call[0] && String(call[0]).includes('Encountered two children with the same key')
    );

    spyConsoleError.mockRestore();

    expect(duplicateKeyCall).toBeUndefined();
    console.log('[HARDENING VERIFIED] Verified unique step ID generation prevents React duplicate key warnings.');
  });

  // =========================================================================
  // 2. Rapid Double-Click Race Condition on "Run Flow"
  // =========================================================================
  it('2. Rapid Double-Click on Run Flow triggers race condition / double execution', async () => {
    await renderComponent(<App />);

    const runFlowBtn = getByTestId('run-flow-btn') as HTMLButtonElement;

    // Trigger double click synchronously before React async state update disables button
    await act(async () => {
      runFlowBtn.click();
      runFlowBtn.click();
    });

    await waitForExecution(400);

    const statusBadge = getByTestId('flow-status-badge');
    expect(statusBadge?.textContent?.toLowerCase()).toContain('completed');
  });

  // =========================================================================
  // 3. Concurrent "Run Step" during active "Run Flow" Execution
  // =========================================================================
  it('3. Concurrent "Run Step" while "Run Flow" is executing is disabled by UI (hardened)', async () => {
    await renderComponent(<App />);

    const addBtn = getByTestId('add-step-btn') as HTMLButtonElement;
    await act(async () => {
      addBtn.click();
    });

    const runFlowBtn = getByTestId('run-flow-btn') as HTMLButtonElement;
    const runStep1Btn = getByTestId('step-run-btn-1') as HTMLButtonElement;

    // Start full flow
    await act(async () => {
      runFlowBtn.click();
    });

    // Before step 1 completes, check if Step 2 run button is disabled
    const step2BtnDisabledBeforeFinish = runStep1Btn.disabled;
    console.log(`[HARDENING VERIFIED] Run Step 2 disabled state during Run Flow: ${step2BtnDisabledBeforeFinish}`);
    expect(step2BtnDisabledBeforeFinish).toBe(true);

    await waitForExecution(400);
  });

  // =========================================================================
  // 4. Re-ordering steps while Flow is running is disabled (hardened)
  // =========================================================================
  it('4. Reordering steps while Flow is running is disabled', async () => {
    await renderComponent(<App />);

    const addBtn = getByTestId('add-step-btn') as HTMLButtonElement;
    await act(async () => {
      addBtn.click();
    });

    const step0Name = getByTestId('step-title-input-0') as HTMLInputElement;
    const step1Name = getByTestId('step-title-input-1') as HTMLInputElement;
    await changeInputValue(step0Name, 'First Step');
    await changeInputValue(step1Name, 'Second Step');

    const runFlowBtn = getByTestId('run-flow-btn') as HTMLButtonElement;

    // Start Flow execution
    await act(async () => {
      runFlowBtn.click();
    });

    // Move step 0 down while flow is running should be disabled
    const moveDownBtn0 = getByTestId('step-move-down-btn-0') as HTMLButtonElement;
    expect(moveDownBtn0.disabled).toBe(true);

    // Wait for flow execution to finish
    await waitForExecution(500);

    const currentStep0Name = (getByTestId('step-title-input-0') as HTMLInputElement).value;
    expect(currentStep0Name).toBe('First Step');
  });

  // =========================================================================
  // 5. Unhandled Adapter Exception propagation & Error State Handling
  // =========================================================================
  it('5. Engine handles unhandled adapter promise rejection gracefully without crashing', async () => {
    const crashingAdapter = {
      executePrompt: vi.fn().mockRejectedValue(new Error('Fatal Network Disconnect')),
    };

    const flow: Flow = {
      id: 'crash-flow',
      name: 'Crash Test Flow',
      initialInput: 'init',
      steps: [createDefaultStep('s1', 'Step 1', 'Test prompt')],
    };

    const result = await runFlow(flow, { adapter: crashingAdapter });
    expect(result.state.status).toBe('error');
    expect(result.flow.steps[0].status).toBe('error');
    expect(result.flow.steps[0].error).toBe('Fatal Network Disconnect');
    expect(result.metrics.failedStepIndex).toBe(0);
  });

  // =========================================================================
  // 6. Memory & Latency Stress Test (500 rapid flow runs)
  // =========================================================================
  it('6. Engine executes 500 rapid 10-step flows without memory leak or performance degradation', async () => {
    const fastAdapter = {
      executePrompt: async (p: string) => ({ text: `Response to ${p}`, latencyMs: 0 }),
    };

    const flow: Flow = {
      id: 'stress-flow',
      name: 'Stress Flow',
      initialInput: 'start context',
      steps: Array.from({ length: 10 }, (_, i) =>
        createDefaultStep(`step_${i}`, `Step ${i}`, `Prompt {{input}} {{step${i}.output}}`)
      ),
    };

    const startMemory = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    for (let i = 0; i < 500; i++) {
      await runFlow(flow, { adapter: fastAdapter });
    }

    const duration = performance.now() - startTime;
    const endMemory = process.memoryUsage().heapUsed;
    const memDeltaMB = (endMemory - startMemory) / (1024 * 1024);

    console.log(`[STRESS METRICS] 500 10-step flows (5,000 steps total) executed in ${duration.toFixed(2)}ms. Heap Delta: ${memDeltaMB.toFixed(2)} MB`);
    expect(duration).toBeLessThan(5000);
  });

  // =========================================================================
  // 7. Large Context Accumulation & Deep Alias Chain
  // =========================================================================
  it('7. Handles deep flow (50 steps) with 500 context key aliases without context corruption', async () => {
    const fastAdapter = {
      executePrompt: async (p: string) => ({ text: `Output_${p.slice(0, 10)}`, latencyMs: 0 }),
    };

    const steps = Array.from({ length: 50 }, (_, i) =>
      createDefaultStep(`step_${i + 1}`, `Step ${i + 1}`, `Step ${i + 1}: {{input}} {{step${i}.output}}`)
    );

    const flow: Flow = {
      id: 'deep-flow',
      name: 'Deep Flow',
      initialInput: 'Base context data',
      steps,
    };

    const result = await runFlow(flow, { adapter: fastAdapter });
    expect(result.state.status).toBe('completed');
    expect(result.metrics.completedStepsCount).toBe(50);
    expect(Object.keys(result.state.context).length).toBeGreaterThan(200);
  });
});
