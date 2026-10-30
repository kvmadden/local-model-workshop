/**
 * ui-flows.stress.test.tsx
 * Stress and edge-case tests for UI components and data flows
 *
 * Focus areas:
 * 1. Edge-case analysis of Custom text inputs in Document Summarizer & Dictation Cleanup playgrounds:
 *    - Rapid input changes
 *    - Extremely long texts (100k+ chars)
 *    - Special characters, unicode, XSS strings, template tags
 *    - Data flow analysis (custom text vs preset sample outputs)
 * 2. Modal dismissal behavior in TaskWizard & ModelCatalog:
 *    - Backdrop click dismissal
 *    - Escape key dismissal
 *    - Close button dismissal
 * 3. Tab state persistence and responsive navigation in Header.tsx & App.tsx:
 *    - Tab switching and state persistence (localStorage / URL state)
 *    - Mobile responsive flex container styling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Same hermetic pin as the sibling suites (2026-08-06). These assert the
// playgrounds' DEMO output, but a playground runs LIVE whenever a matching model
// tag is installed, so with an engine up they stream real model text and the
// canned string never appears. Pin the status probe unavailable; the rest of the
// service stays real via importActual.
vi.mock('../services/ollamaService', async () => {
  const actual = await vi.importActual<typeof import('../services/ollamaService')>('../services/ollamaService');
  return { ...actual, checkOllamaStatus: vi.fn(async () => ({ available: false, models: [] })) };
});

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Header } from './Header';
import { TaskWizard } from './TaskWizard';
import { ModelCatalog } from './ModelCatalog';
import { DocSummarizingPlayground } from './playgrounds/DocSummarizingPlayground';
import { DictationCleanupPlayground } from './playgrounds/DictationCleanupPlayground';
import App from '../App';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('UI components and data flows stress tests', () => {
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
      }
      const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      nativeSetter?.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  const waitMs = async (ms = 450) => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  };

  // =========================================================================
  // Task 1a: Custom Text Inputs in Document Summarizer Playground
  // =========================================================================
  describe('Document Summarizer Playground — Text Input Edge Cases', () => {
    it('handles rapid sequential input changes without crashing or UI freeze', async () => {
      await renderComponent(<DocSummarizingPlayground />);
      const textarea = getByTestId('doc-input-textarea') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();

      // Rapidly change input 50 times
      for (let i = 0; i < 50; i++) {
        await changeInputValue(textarea, `Rapid input text iteration ${i} — ${Math.random()}`);
      }

      expect(textarea.value).toContain('Rapid input text iteration 49');
    });

    it('handles extremely long text input (100,000 characters)', async () => {
      await renderComponent(<DocSummarizingPlayground />);
      const textarea = getByTestId('doc-input-textarea') as HTMLTextAreaElement;

      const longText = 'A'.repeat(100000);
      await changeInputValue(textarea, longText);

      expect(textarea.value.length).toBe(100000);

      const summarizeBtn = getByTestId('summarize-btn') as HTMLButtonElement;
      expect(summarizeBtn.disabled).toBe(false);
    });

    it('handles special characters, HTML tags, backslashes, and unicode emojis safely', async () => {
      await renderComponent(<DocSummarizingPlayground />);
      const textarea = getByTestId('doc-input-textarea') as HTMLTextAreaElement;

      const specialText = `<script>alert("xss")</script> 🚀 {{template.var}} \\n \\t 'single' "double" & &amp; 🤖 100% confidential data`;
      await changeInputValue(textarea, specialText);

      expect(textarea.value).toBe(specialText);

      const summarizeBtn = getByTestId('summarize-btn') as HTMLButtonElement;
      await act(async () => {
        summarizeBtn.click();
      });

      await waitMs(500);

      const summaryOutput = getByTestId('summary-output');
      expect(summaryOutput?.textContent).not.toContain('<script>');
    });

    it('EMPIRICAL FINDING: custom text typed in textarea is IGNORED by output engine', async () => {
      await renderComponent(<DocSummarizingPlayground />);
      const textarea = getByTestId('doc-input-textarea') as HTMLTextAreaElement;

      const customUserDoc = 'Unique Custom Business Proposal For Enterprise Client XYZ 999';
      await changeInputValue(textarea, customUserDoc);

      const summarizeBtn = getByTestId('summarize-btn') as HTMLButtonElement;
      await act(async () => {
        summarizeBtn.click();
      });

      await waitMs(500);

      const summaryOutput = getByTestId('summary-output');
      // The output contains hardcoded preset text for sample index 0, completely ignoring customUserDoc!
      expect(summaryOutput?.textContent).not.toContain('Enterprise Client XYZ 999');
      expect(summaryOutput?.textContent).toContain('Executive Financial & Operations Summary');
    });

    it('disables summarize button when input is empty or whitespace only', async () => {
      await renderComponent(<DocSummarizingPlayground />);
      const textarea = getByTestId('doc-input-textarea') as HTMLTextAreaElement;
      const summarizeBtn = getByTestId('summarize-btn') as HTMLButtonElement;

      await changeInputValue(textarea, '   \n\t  ');

      expect(summarizeBtn.disabled).toBe(true);
    });
  });

  // =========================================================================
  // Task 1b: Custom Text Inputs in Dictation Cleanup Playground
  // =========================================================================
  describe('Dictation Cleanup Playground — Text Input Edge Cases', () => {
    it('handles rapid sequential input changes and toggle clicks concurrently', async () => {
      await renderComponent(<DictationCleanupPlayground />);
      const textarea = getByTestId('dictation-input-textarea') as HTMLTextAreaElement;
      const toggle = getByTestId('filler-cleanup-toggle') as HTMLInputElement;

      for (let i = 0; i < 30; i++) {
        await changeInputValue(textarea, `Dictation audio ramble step ${i} um like basically`);
        await act(async () => {
          toggle.click();
        });
      }

      expect(textarea.value).toContain('step 29');
    });

    it('renders user input in spoken-ramble-view verbatim', async () => {
      await renderComponent(<DictationCleanupPlayground />);
      const textarea = getByTestId('dictation-input-textarea') as HTMLTextAreaElement;

      const userRamble = 'um like so basically we need to finish the project by Friday ok?';
      await changeInputValue(textarea, userRamble);

      const spokenView = getByTestId('spoken-ramble-view');
      expect(spokenView?.textContent).toContain(userRamble);
    });

    it('EMPIRICAL FINDING: custom text typed in dictation textarea is IGNORED in polished output', async () => {
      await renderComponent(<DictationCleanupPlayground />);
      const textarea = getByTestId('dictation-input-textarea') as HTMLTextAreaElement;

      const customRamble = 'uh um so basically confidential merger with Acme Corp 123';
      await changeInputValue(textarea, customRamble);

      const polishBtn = getByTestId('polish-dictation-btn') as HTMLButtonElement;
      await act(async () => {
        polishBtn.click();
      });

      await waitMs(500);

      const polishedView = getByTestId('polished-memo-view');
      // Polished view outputs preset sample 0 text, ignoring customRamble content in the output prose!
      expect(polishedView?.textContent).not.toContain('Acme Corp 123');
      expect(polishedView?.textContent).toContain('Project Status Update');
    });
  });

  // =========================================================================
  // Task 1c: Modal Dismissal Behavior (Backdrop Click / Escape Key / Close Btn)
  // =========================================================================
  describe('Modal Dismissal Behavior — TaskWizard & ModelCatalog Modals', () => {
    it('TaskWizard modal: Close button dismisses modal successfully', async () => {
      await renderComponent(<TaskWizard />);

      const openBtn = getByTestId('view-setup-guide-btn');
      await act(async () => {
        openBtn?.click();
      });

      expect(getByTestId('task-setup-modal')).not.toBeNull();

      const closeBtn = getByTestId('close-task-modal-btn');
      await act(async () => {
        closeBtn?.click();
      });

      expect(getByTestId('task-setup-modal')).toBeNull();
    });

    it('EMPIRICAL FINDING — TaskWizard modal: Backdrop click DOES NOT dismiss modal (Lacks backdrop click handler)', async () => {
      await renderComponent(<TaskWizard />);

      const openBtn = getByTestId('view-setup-guide-btn');
      await act(async () => {
        openBtn?.click();
      });

      const modalBackdrop = getByTestId('task-setup-modal');
      expect(modalBackdrop).not.toBeNull();

      // Click on backdrop overlay
      await act(async () => {
        modalBackdrop?.click();
      });

      // Modal remains OPEN because backdrop has no onClick handler
      expect(getByTestId('task-setup-modal')).not.toBeNull();
    });

    it('EMPIRICAL FINDING — TaskWizard modal: Escape key DOES NOT dismiss modal (Lacks keydown listener)', async () => {
      await renderComponent(<TaskWizard />);

      const openBtn = getByTestId('view-setup-guide-btn');
      await act(async () => {
        openBtn?.click();
      });

      expect(getByTestId('task-setup-modal')).not.toBeNull();

      // Dispatch Escape key event on window
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      });

      // Modal remains OPEN because there is no Escape key listener
      expect(getByTestId('task-setup-modal')).not.toBeNull();
    });

    it('ModelCatalog modal: Close button dismisses modal successfully', async () => {
      await renderComponent(<ModelCatalog />);

      const setupBtn = getByTestId('setup-modal-btn-llama-3.2-3b');
      await act(async () => {
        setupBtn?.click();
      });

      expect(getByTestId('model-setup-modal')).not.toBeNull();

      const closeBtn = getByTestId('close-modal-btn');
      await act(async () => {
        closeBtn?.click();
      });

      expect(getByTestId('model-setup-modal')).toBeNull();
    });

    it('EMPIRICAL FINDING — ModelCatalog modal: Backdrop click DOES NOT dismiss modal', async () => {
      await renderComponent(<ModelCatalog />);

      const setupBtn = getByTestId('setup-modal-btn-llama-3.2-3b');
      await act(async () => {
        setupBtn?.click();
      });

      const modalBackdrop = getByTestId('model-setup-modal');
      expect(modalBackdrop).not.toBeNull();

      await act(async () => {
        modalBackdrop?.click();
      });

      // Modal remains OPEN
      expect(getByTestId('model-setup-modal')).not.toBeNull();
    });

    it('EMPIRICAL FINDING — ModelCatalog modal: Escape key DOES NOT dismiss modal', async () => {
      await renderComponent(<ModelCatalog />);

      const setupBtn = getByTestId('setup-modal-btn-llama-3.2-3b');
      await act(async () => {
        setupBtn?.click();
      });

      expect(getByTestId('model-setup-modal')).not.toBeNull();

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      });

      // Modal remains OPEN
      expect(getByTestId('model-setup-modal')).not.toBeNull();
    });
  });

  // =========================================================================
  // Task 1d: Header Tab Switching, State Persistence & Responsive Design
  // =========================================================================
  describe('Header & App — Tab Persistence & Responsive Switch Edge Cases', () => {
    it('switches tabs cleanly when clicked in Header.tsx', async () => {
      const handleTabChange = vi.fn();
      await renderComponent(<Header activeTab="wizard" onTabChange={handleTabChange} />);

      await act(async () => {
        getByTestId('tab-model-catalog')?.click();
      });
      expect(handleTabChange).toHaveBeenCalledWith('catalog');

      await act(async () => {
        getByTestId('tab-use-case-studio')?.click();
      });
      expect(handleTabChange).toHaveBeenCalledWith('studio');

      await act(async () => {
        getByTestId('tab-flow-builder')?.click();
      });
      expect(handleTabChange).toHaveBeenCalledWith('builder');
    });

    it('EMPIRICAL FINDING: App activeTab is in memory only (no localStorage or URL state persistence)', async () => {
      await renderComponent(<App initialTab="catalog" />);

      expect(getByTestId('model-catalog-container')).not.toBeNull();

      // Switch tab to Task Wizard
      await act(async () => {
        getByTestId('tab-task-wizard')?.click();
      });

      expect(getByTestId('task-wizard-container')).not.toBeNull();

      // Remounting App without explicit initialTab resets state to default ('builder')
      await act(async () => {
        root?.unmount();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        root.render(<App />);
      });

      // Resets to initial tab ('builder') because activeTab is not stored in localStorage or URL hash
      expect(getByTestId('flow-canvas')).not.toBeNull();
      expect(getByTestId('task-wizard-container')).toBeNull();
    });

    it('RESPONSIVE LAYOUT FIX: nav tab container uses scrollable overflow-x-auto container', async () => {
      await renderComponent(<Header activeTab="wizard" onTabChange={() => {}} />);

      const navTabs = getByTestId('workshop-nav-tabs');
      expect(navTabs).not.toBeNull();

      const className = navTabs?.className || '';
      // Nav container uses 'flex items-center gap-1.5' with 'overflow-x-auto' for mobile responsiveness
      expect(className).toContain('flex');
      expect(className).not.toContain('flex-wrap');
      expect(className).toContain('overflow-x-auto');
    });
  });
});
