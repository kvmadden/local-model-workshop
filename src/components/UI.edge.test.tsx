/**
 * UI component and App edge-case tests
 *
 * Direct JSDOM empirical verification for src/components/ and src/App.tsx
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import App from '../App';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('UI components and App edge cases', () => {
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

  // Helper to change input value in React 18 controlled components
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

  // Helper to wait for async flow execution (mock latency is ~300ms)
  const waitForExecution = async (ms = 500) => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  };

  // Event-driven wait for the flow/step run to actually finish, instead of
  // sleeping a fixed duration and hoping. Every step's Inspector output editor
  // is disabled while `flowStatus === 'running'` or that step is running, so the
  // editor's disabled flag IS the execution-state transition.
  //
  // Why this exists: a fixed `waitForExecution(400)` raced the runner under
  // parallel suite load. When it returned early the run was still in flight, and
  // a value typed into the override editor at that moment was wholesale-replaced
  // by the run's completion write (`updateStepsState(result.flow.steps)` in
  // App.tsx replaces the array with steps derived from the pre-override
  // snapshot). Real users cannot hit that window -- the editor is `disabled`
  // during a run -- so this is a harness ordering bug, not a product bug, and
  // the fix is to wait on the transition rather than to lengthen the sleep.
  const waitForFlowIdle = async (timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const editor = getByTestId('step-output-editor-0') as HTMLTextAreaElement | null;
      if (editor && !editor.disabled) return;
      if (Date.now() > deadline) {
        throw new Error(`waitForFlowIdle: flow still executing after ${timeoutMs}ms`);
      }
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  };

  // =========================================================================
  // 1. App Rendering & Core Flow Execution
  // =========================================================================
  describe('1. App Component & Core Canvas Workflow', () => {
    it('renders initial App canvas with default title, input textarea, and step card 0', async () => {
      await renderComponent(<App />);

      expect(getByTestId('app-container')).not.toBeNull();
      expect(getByTestId('flow-title-input')).not.toBeNull();
      expect(getByTestId('initial-input-textarea')).not.toBeNull();
      expect(getByTestId('flow-canvas')).not.toBeNull();
      expect(getByTestId('add-step-btn')).not.toBeNull();
      expect(getByTestId('run-flow-btn')).not.toBeNull();
      expect(getByTestId('step-card-0')).not.toBeNull();
    });

    it('adds step cards when "Add Step" button is clicked', async () => {
      await renderComponent(<App />);

      const addBtn = getByTestId('add-step-btn') as HTMLButtonElement;
      expect(addBtn).not.toBeNull();

      await act(async () => {
        addBtn.click();
      });

      expect(getByTestId('step-card-0')).not.toBeNull();
      expect(getByTestId('step-card-1')).not.toBeNull();
    });

    it('runs flow and updates step badges to completed with outputs', async () => {
      await renderComponent(<App />);

      const initialInput = getByTestId('initial-input-textarea') as HTMLTextAreaElement;
      const step0Prompt = getByTestId('step-prompt-textarea-0') as HTMLTextAreaElement;

      await changeInputValue(initialInput, 'Quantum Computing');
      await changeInputValue(step0Prompt, 'Summarize: {{input}}');

      const runFlowBtn = getByTestId('run-flow-btn') as HTMLButtonElement;
      await act(async () => {
        runFlowBtn.click();
      });

      await waitForExecution(400);

      const badge0 = getByTestId('step-status-badge-0');
      expect(badge0?.textContent?.toLowerCase()).toContain('completed');

      const outputContainer0 = getByTestId('step-output-container-0');
      expect(outputContainer0?.textContent).toContain('Quantum Computing');
    });
  });

  // =========================================================================
  // 2. Multi-line Prompts & Formatting Preservation
  // =========================================================================
  describe('2. Multi-line Prompts & Code Snippet Templates', () => {
    it('preserves multi-line prompt formatting, newlines, and code blocks', async () => {
      await renderComponent(<App />);

      const multilinePrompt = `System:\n  Line 1: Context\n  Line 2: \`\`\`ts\n  const code = 100;\n  \`\`\`\nInput: {{input}}`;

      const step0Prompt = getByTestId('step-prompt-textarea-0') as HTMLTextAreaElement;
      await changeInputValue(step0Prompt, multilinePrompt);

      expect(step0Prompt.value).toBe(multilinePrompt);

      const runFlowBtn = getByTestId('run-flow-btn') as HTMLButtonElement;
      await act(async () => {
        runFlowBtn.click();
      });

      await waitForExecution(400);

      const outputContainer = getByTestId('step-output-container-0');
      expect(outputContainer?.textContent).toBeDefined();
    });
  });

  // =========================================================================
  // 3. Template Variables with Special Characters & Whitespace
  // =========================================================================
  describe('3. Template Variables with Spaces and Special Characters', () => {
    it('handles {{ input }} with spaces and special character inputs', async () => {
      await renderComponent(<App />);

      const initialInput = getByTestId('initial-input-textarea') as HTMLTextAreaElement;
      const step0Prompt = getByTestId('step-prompt-textarea-0') as HTMLTextAreaElement;

      await changeInputValue(initialInput, 'Special: $%#@! & <script>alert(1)</script>');
      await changeInputValue(step0Prompt, 'Echo: {{  input  }}');

      const runFlowBtn = getByTestId('run-flow-btn') as HTMLButtonElement;
      await act(async () => {
        runFlowBtn.click();
      });

      await waitForExecution(400);

      const outputContainer = getByTestId('step-output-container-0');
      expect(outputContainer?.textContent).toContain('Special: $%#@! & <script>alert(1)</script>');
    });
  });

  // =========================================================================
  // 4. Step Re-ordering & Re-index verification
  // =========================================================================
  describe('4. Step Re-ordering (Move Up / Move Down)', () => {
    it('reorders steps correctly when Move Down and Move Up are clicked', async () => {
      await renderComponent(<App />);

      const addBtn = getByTestId('add-step-btn') as HTMLButtonElement;
      await act(async () => {
        addBtn.click();
      });

      const step0Name = getByTestId('step-title-input-0') as HTMLInputElement;
      const step1Name = getByTestId('step-title-input-1') as HTMLInputElement;

      await changeInputValue(step0Name, 'Alpha Step');
      await changeInputValue(step1Name, 'Beta Step');

      const moveDownBtn0 = getByTestId('step-move-down-btn-0') as HTMLButtonElement;
      await act(async () => {
        moveDownBtn0.click();
      });

      // Index 0 should now be Beta Step, Index 1 should be Alpha Step
      const updatedStep0Name = getByTestId('step-title-input-0') as HTMLInputElement;
      const updatedStep1Name = getByTestId('step-title-input-1') as HTMLInputElement;
      expect(updatedStep0Name.value).toBe('Beta Step');
      expect(updatedStep1Name.value).toBe('Alpha Step');

      // Move Up index 1
      const moveUpBtn1 = getByTestId('step-move-up-btn-1') as HTMLButtonElement;
      await act(async () => {
        moveUpBtn1.click();
      });

      expect((getByTestId('step-title-input-0') as HTMLInputElement).value).toBe('Alpha Step');
      expect((getByTestId('step-title-input-1') as HTMLInputElement).value).toBe('Beta Step');
    });
  });

  // =========================================================================
  // 5. Endpoint Settings Toggling (Provider, Model, Temperature)
  // =========================================================================
  describe('5. Endpoint Settings & Model Toggling', () => {
    it('toggles model provider and updates default model identifier', async () => {
      await renderComponent(<App />);

      const providerSelect = getByTestId('step-provider-select-0') as HTMLSelectElement;
      const modelInput = getByTestId('step-model-select-0') as HTMLInputElement;
      const tempSlider = getByTestId('step-temp-slider-0') as HTMLInputElement;

      expect(providerSelect.value).toBe('mock');

      // Switch provider to ollama
      await changeInputValue(providerSelect, 'ollama');
      expect(modelInput.value).toBe('llama3');

      // Switch provider to a local OpenAI-compatible server
      await changeInputValue(providerSelect, 'openai');
      expect(modelInput.value).toBe('local-model');
      expect((getByTestId('step-endpoint-input-0') as HTMLInputElement).value).toBe('http://127.0.0.1:1234/v1/chat/completions');
      expect(getByTestId('step-endpoint-note-0')?.textContent).toContain('on this Mac');

      // An address on another machine is flagged, and the adapter refuses to send there
      await changeInputValue(getByTestId('step-endpoint-input-0') as HTMLInputElement, 'https://api.example.com/v1/chat/completions');
      expect(getByTestId('step-endpoint-note-0')?.textContent).toContain('not this Mac');

      // Edit model input
      await changeInputValue(modelInput, 'gpt-4o');
      expect(modelInput.value).toBe('gpt-4o');

      // Adjust temperature slider
      await changeInputValue(tempSlider, '0.9');
      expect(tempSlider.value).toBe('0.9');
    });
  });

  // =========================================================================
  // 6. Rapid Step Additions & Deletions
  // =========================================================================
  describe('6. Rapid Step Additions and Deletions', () => {
    it('handles multiple step additions and deletion down to min 1 step', async () => {
      await renderComponent(<App />);

      const addBtn = getByTestId('add-step-btn') as HTMLButtonElement;

      // Add 3 steps sequentially
      await act(async () => {
        addBtn.click();
      });
      await act(async () => {
        addBtn.click();
      });
      await act(async () => {
        addBtn.click();
      });

      expect(getByTestId('step-card-0')).not.toBeNull();
      expect(getByTestId('step-card-1')).not.toBeNull();
      expect(getByTestId('step-card-2')).not.toBeNull();
      expect(getByTestId('step-card-3')).not.toBeNull();

      // Delete step at index 1
      const deleteBtn1 = getByTestId('step-delete-btn-1') as HTMLButtonElement;
      await act(async () => {
        deleteBtn1.click();
      });

      expect(getByTestId('step-card-0')).not.toBeNull();
      expect(getByTestId('step-card-1')).not.toBeNull();
      expect(getByTestId('step-card-2')).not.toBeNull();
      expect(getByTestId('step-card-3')).toBeNull();

      // Delete remaining steps until 1 left
      const deleteBtn2 = getByTestId('step-delete-btn-2') as HTMLButtonElement;
      await act(async () => {
        deleteBtn2?.click();
      });

      const deleteBtn1_next = getByTestId('step-delete-btn-1') as HTMLButtonElement;
      await act(async () => {
        deleteBtn1_next?.click();
      });

      expect(getByTestId('step-card-0')).not.toBeNull();
      expect(getByTestId('step-card-1')).toBeNull();

      // Delete button on the last remaining step should be disabled
      const lastDeleteBtn = getByTestId('step-delete-btn-0') as HTMLButtonElement;
      expect(lastDeleteBtn.disabled).toBe(true);
    });
  });

  // =========================================================================
  // 7. Intermediate Output Overriding & Downstream Propagation
  // =========================================================================
  describe('7. Inspector Intermediate Output Overriding', () => {
    it('allows manually editing step output editor and re-running downstream step', async () => {
      await renderComponent(<App />);

      const addBtn = getByTestId('add-step-btn') as HTMLButtonElement;
      await act(async () => {
        addBtn.click();
      });

      const initialInput = getByTestId('initial-input-textarea') as HTMLTextAreaElement;
      const step0Prompt = getByTestId('step-prompt-textarea-0') as HTMLTextAreaElement;
      const step1Prompt = getByTestId('step-prompt-textarea-1') as HTMLTextAreaElement;

      await changeInputValue(initialInput, 'Raw Start');
      await changeInputValue(step0Prompt, 'Step 1: {{input}}');
      await changeInputValue(step1Prompt, 'Step 2: {{step1.output}}');

      // Run full flow first
      const runFlowBtn = getByTestId('run-flow-btn') as HTMLButtonElement;
      await act(async () => {
        runFlowBtn.click();
      });

      // Must be the state transition, not a sleep: overriding while the run is
      // still in flight lets the run's completion write replace the override.
      await waitForFlowIdle();

      // Override Step 0 output editor
      const step0OutputEditor = getByTestId('step-output-editor-0') as HTMLTextAreaElement;
      await changeInputValue(step0OutputEditor, 'OVERRIDDEN_TEXT_VALUE');

      // Run Step 1 individually
      const step1RunBtn = getByTestId('step-run-btn-1') as HTMLButtonElement;
      await act(async () => {
        step1RunBtn.click();
      });

      await waitForFlowIdle();

      const step1OutputContainer = getByTestId('step-output-container-1');
      expect(step1OutputContainer?.textContent).toContain('OVERRIDDEN_TEXT_VALUE');
    });
  });

  // =========================================================================
  // 8. Simulated Error & Error Container Rendering
  // =========================================================================
  describe('8. Simulated Backend Error Banner Rendering', () => {
    it('renders error container when a step experiences execution failure', async () => {
      await renderComponent(<App />);

      const step0Prompt = getByTestId('step-prompt-textarea-0') as HTMLTextAreaElement;
      await changeInputValue(step0Prompt, '[SIMULATE_ERROR] Backend failure test');

      const runFlowBtn = getByTestId('run-flow-btn') as HTMLButtonElement;
      await act(async () => {
        runFlowBtn.click();
      });

      await waitForExecution(400);

      const step0Badge = getByTestId('step-status-badge-0');
      expect(step0Badge?.textContent?.toLowerCase()).toContain('error');

      const errorContainer = getByTestId('step-error-container-0');
      expect(errorContainer).not.toBeNull();
      expect(errorContainer?.textContent).toContain('Simulated mock endpoint error');
    });
  });

  // =========================================================================
  // 9. Stress / Edge Case: Rapid Synchronous Step Additions
  // =========================================================================
  describe('9. Synchronous Rapid Step Additions ID Generation', () => {
    it('evaluates step state updates when add step is triggered rapidly', async () => {
      await renderComponent(<App />);
      const addBtn = getByTestId('add-step-btn') as HTMLButtonElement;

      await act(async () => {
        addBtn.click();
        addBtn.click();
      });

      const card0 = getByTestId('step-card-0');
      const card1 = getByTestId('step-card-1');
      const card2 = getByTestId('step-card-2');

      expect(card0).not.toBeNull();
      expect(card1).not.toBeNull();
      expect(card2).not.toBeNull();
    });
  });
});
