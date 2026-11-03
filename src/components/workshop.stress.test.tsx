/**
 * workshop.stress.test.tsx
 * Stress tests for the workshop components
 *
 * Direct JSDOM empirical verification testing:
 * 1. Task Wizard tab switching, task selection, setup modal open/close.
 * 2. Model Catalog filtering by RAM (8GB vs 16GB+ vs All), model card setup modal trigger.
 * 3. 4 Use Case Studio Playgrounds (Voice Transcription, Doc Summarizing, Dictation Cleanup, File Chatting):
 *    - Sample chip selection, custom inputs, state toggles (filler word removal), output generation, empty/edge case inputs.
 * 4. Anti-leak assertions: zero <pre>/<code> tags, zero raw JSON dumps, and zero mustache syntax ({{input}}) across workshop tabs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Same hermetic pin as WorkshopComponents.test.tsx, and for the same measured reason:
// this suite asserts the playgrounds' DEMO output, but the playgrounds run LIVE
// whenever a matching model tag is installed in Ollama. It was green only because
// no engine existed. Pin the status probe unavailable so the demo path is
// deterministic; everything else in the service stays real via importActual.
vi.mock('../services/ollamaService', async () => {
  const actual = await vi.importActual<typeof import('../services/ollamaService')>('../services/ollamaService');
  return { ...actual, checkOllamaStatus: vi.fn(async () => ({ available: false, models: [] })) };
});

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { App } from '../App';
import { TaskWizard } from './TaskWizard';
import { ModelCatalog } from './ModelCatalog';
import { UseCaseStudio } from './UseCaseStudio';
import { VoiceTranscriptionPlayground } from './playgrounds/VoiceTranscriptionPlayground';
import { DocSummarizingPlayground } from './playgrounds/DocSummarizingPlayground';
import { DictationCleanupPlayground } from './playgrounds/DictationCleanupPlayground';
import { FileChattingPlayground } from './playgrounds/FileChattingPlayground';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Workshop stress tests', () => {
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

  const waitMs = async (ms = 450) => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  };

  // =========================================================================
  // 1. Task Wizard Interactive Stress Tests
  // =========================================================================
  describe('1. Task Wizard Tab Switching, Goal Selection & Setup Modal', () => {
    it('switches to Task Wizard tab in App and renders hero & container', async () => {
      await renderComponent(<App initialTab="wizard" />);

      expect(getByTestId('task-wizard-container')).not.toBeNull();
      expect(getByTestId('wizard-heading')?.textContent).toContain('Match Your Mac Goal');
      expect(getByTestId('hero-section')).not.toBeNull();

      // Switch to catalog then back to wizard via header tabs
      const catalogTabBtn = getByTestId('tab-model-catalog');
      await act(async () => {
        catalogTabBtn?.click();
      });
      expect(getByTestId('model-catalog-container')).not.toBeNull();

      const wizardTabBtn = getByTestId('tab-task-wizard');
      await act(async () => {
        wizardTabBtn?.click();
      });
      expect(getByTestId('task-wizard-container')).not.toBeNull();
    });

    it('selects different goals and updates recommendation card dynamically', async () => {
      await renderComponent(<TaskWizard />);

      // Default goal should be transcribe-meetings
      expect(getByTestId('recommended-app')?.textContent).toBe('MacWhisper');
      expect(getByTestId('recommended-model')?.textContent).toContain('Whisper (Large-v3)');

      // Select document search goal
      const docSearchOption = getByTestId('task-option-document-search');
      await act(async () => {
        docSearchOption?.click();
      });

      expect(getByTestId('recommended-app')?.textContent).toBe('AnythingLLM');
      expect(getByTestId('recommended-model')?.textContent).toContain('Llama 3.2 (3B)');

      // Select dictate notes goal
      const dictateOption = getByTestId('task-option-dictation-cleanup');
      await act(async () => {
        dictateOption?.click();
      });

      expect(getByTestId('recommended-app')?.textContent).toBe('LM Studio');
      expect(getByTestId('recommended-model')?.textContent).toContain('Phi-3.5 Mini (3.8B)');

      // Select general Q&A / chat goal
      const generalQaOption = getByTestId('task-option-general-qa');
      await act(async () => {
        generalQaOption?.click();
      });

      expect(getByTestId('recommended-app')?.textContent).toBe('LM Studio');
      expect(getByTestId('recommended-model')?.textContent).toContain('Qwen 2.5 (7B)');
    });

    it('opens and closes task setup modal cleanly', async () => {
      await renderComponent(<TaskWizard />);

      expect(getByTestId('task-setup-modal')).toBeNull();

      const openModalBtn = getByTestId('view-setup-guide-btn');
      await act(async () => {
        openModalBtn?.click();
      });

      const modal = getByTestId('task-setup-modal');
      expect(modal).not.toBeNull();
      expect(modal?.textContent).toContain('Setup Guide:');

      const closeModalBtn = getByTestId('close-task-modal-btn');
      await act(async () => {
        closeModalBtn?.click();
      });

      expect(getByTestId('task-setup-modal')).toBeNull();
    });

    it('preserves task setup modal state across multiple modal toggle cycles', async () => {
      await renderComponent(<TaskWizard />);

      // Select document search first
      await act(async () => {
        getByTestId('task-option-document-search')?.click();
      });

      // Open modal
      await act(async () => {
        getByTestId('view-setup-guide-btn')?.click();
      });

      const modal = getByTestId('task-setup-modal');
      expect(modal?.textContent).toContain('Setup Guide: Private Document Search & Summaries');
      expect(modal?.textContent).toContain('AnythingLLM');

      // Close modal
      await act(async () => {
        getByTestId('close-task-modal-btn')?.click();
      });

      // Open modal again
      await act(async () => {
        getByTestId('view-setup-guide-btn')?.click();
      });

      expect(getByTestId('task-setup-modal')).not.toBeNull();
    });
  });

  // =========================================================================
  // 2. Model Catalog RAM Filtering & Setup Modal Stress Tests
  // =========================================================================
  describe('2. Model Catalog Filtering & Modal Triggers', () => {
    it('filters models accurately by RAM (8GB vs 16GB+ vs All)', async () => {
      await renderComponent(<ModelCatalog />);

      expect(getByTestId('model-catalog-container')).not.toBeNull();

      // All models initially present
      expect(getByTestId('model-card-llama-3.2-3b')).not.toBeNull();
      expect(getByTestId('model-card-qwen-2.5-7b')).not.toBeNull();
      expect(getByTestId('model-card-deepseek-r1-8b')).not.toBeNull();
      expect(getByTestId('model-card-whisper-large-v3')).not.toBeNull();
      expect(getByTestId('model-card-phi-3.5-mini')).not.toBeNull();

      // Filter by 8GB
      const ram8gbFilter = getByTestId('ram-filter-8gb');
      await act(async () => {
        ram8gbFilter?.click();
      });

      expect(getByTestId('model-card-llama-3.2-3b')).not.toBeNull();
      expect(getByTestId('model-card-whisper-large-v3')).not.toBeNull();
      expect(getByTestId('model-card-phi-3.5-mini')).not.toBeNull();
      expect(getByTestId('model-card-qwen-2.5-7b')).toBeNull();
      expect(getByTestId('model-card-deepseek-r1-8b')).toBeNull();

      // Filter by 16GB+
      const ram16gbFilter = getByTestId('ram-filter-16gb');
      await act(async () => {
        ram16gbFilter?.click();
      });

      expect(getByTestId('model-card-qwen-2.5-7b')).not.toBeNull();
      expect(getByTestId('model-card-deepseek-r1-8b')).not.toBeNull();
      expect(getByTestId('model-card-llama-3.2-3b')).toBeNull();
      expect(getByTestId('model-card-whisper-large-v3')).toBeNull();

      // Reset to All
      const ramAllFilter = getByTestId('ram-filter-all');
      await act(async () => {
        ramAllFilter?.click();
      });

      expect(getByTestId('model-card-llama-3.2-3b')).not.toBeNull();
      expect(getByTestId('model-card-qwen-2.5-7b')).not.toBeNull();
      expect(getByTestId('model-card-deepseek-r1-8b')).not.toBeNull();
    });

    it('triggers model card setup modal for various models and verifies specs', async () => {
      await renderComponent(<ModelCatalog />);

      // Click setup for Llama 3.2 3B
      const llamaBtn = getByTestId('setup-modal-btn-llama-3.2-3b');
      await act(async () => {
        llamaBtn?.click();
      });

      let modal = getByTestId('model-setup-modal');
      expect(modal).not.toBeNull();
      expect(modal?.textContent).toContain('1-Click Setup Guide: Llama 3.2 (3B)');
      expect(modal?.textContent).toContain('8 GB System RAM');

      // Close modal
      const closeBtn = getByTestId('close-modal-btn');
      await act(async () => {
        closeBtn?.click();
      });

      expect(getByTestId('model-setup-modal')).toBeNull();

      // Click setup for Qwen 2.5 7B
      const qwenBtn = getByTestId('setup-modal-btn-qwen-2.5-7b');
      await act(async () => {
        qwenBtn?.click();
      });

      modal = getByTestId('model-setup-modal');
      expect(modal).not.toBeNull();
      expect(modal?.textContent).toContain('1-Click Setup Guide: Qwen 2.5 (7B)');
      expect(modal?.textContent).toContain('16 GB System RAM');
    });
  });

  // =========================================================================
  // 3. 4 Use Case Studio Playgrounds Interactive Stress Tests
  // =========================================================================
  describe('3. 4 Use Case Studio Playgrounds Interactive & Stress Testing', () => {
    it('UseCaseStudio switches sub-tabs to all 4 playgrounds cleanly', async () => {
      await renderComponent(<UseCaseStudio />);

      expect(getByTestId('voice-transcription-playground')).not.toBeNull();

      await act(async () => {
        getByTestId('usecase-tab-summarizing')?.click();
      });
      expect(getByTestId('doc-summarizing-playground')).not.toBeNull();

      await act(async () => {
        getByTestId('usecase-tab-dictation')?.click();
      });
      expect(getByTestId('dictation-cleanup-playground')).not.toBeNull();

      await act(async () => {
        getByTestId('usecase-tab-file-chat')?.click();
      });
      expect(getByTestId('file-chatting-playground')).not.toBeNull();
    });

    // -----------------------------------------------------------------------
    // Voice Transcription Playground
    // -----------------------------------------------------------------------
    describe('VoiceTranscriptionPlayground', () => {
      it('handles sample audio selection, transcription output generation, and export feedback', async () => {
        await renderComponent(<VoiceTranscriptionPlayground />);

        // Default sample 0
        const transcribeBtn = getByTestId('transcribe-btn') as HTMLButtonElement;
        expect(transcribeBtn).not.toBeNull();

        await act(async () => {
          transcribeBtn.click();
        });

        await waitMs(450);

        let output = getByTestId('transcript-output');
        expect(output?.textContent).toContain('Speaker 1');

        // Switch to sample 1
        const chip1 = getByTestId('audio-sample-chip-1');
        await act(async () => {
          chip1?.click();
        });

        await act(async () => {
          transcribeBtn.click();
        });

        await waitMs(450);

        output = getByTestId('transcript-output');
        expect(output?.textContent).toContain('Speaker 1 (Client Lead)');

        // Export writes the transcript on screen to a real .txt file
        const created: Blob[] = [];
        const downloads: string[] = [];
        const origCreate = window.URL.createObjectURL;
        const origRevoke = window.URL.revokeObjectURL;
        window.URL.createObjectURL = vi.fn((blob: Blob) => {
          created.push(blob);
          return 'blob:transcript';
        }) as any;
        window.URL.revokeObjectURL = vi.fn();
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
          downloads.push(this.download);
        });
        try {
          const exportBtn = getByTestId('export-transcript-btn');
          await act(async () => {
            exportBtn?.click();
          });
          expect(exportBtn?.textContent).toContain('Transcript Exported!');
          expect(downloads).toEqual(['transcript.txt']);
          expect(created).toHaveLength(1);
          expect(created[0].type).toBe('text/plain');
          const shown = output?.querySelector('[data-testid="playground-output-container"]')?.textContent ?? '';
          expect(shown).toContain('Speaker 1 (Client Lead)');
          expect(created[0].size).toBe(new Blob([shown]).size);
        } finally {
          clickSpy.mockRestore();
          window.URL.createObjectURL = origCreate;
          window.URL.revokeObjectURL = origRevoke;
        }
      });

      it('handles rapid re-triggering of transcription without crash or unhandled state', async () => {
        await renderComponent(<VoiceTranscriptionPlayground />);

        const transcribeBtn = getByTestId('transcribe-btn') as HTMLButtonElement;

        await act(async () => {
          transcribeBtn.click();
        });
        // Click while processing (should be disabled)
        await act(async () => {
          transcribeBtn.click();
        });

        await waitMs(500);
        expect(getByTestId('transcript-output')?.textContent).toContain('Speaker 1');
      });
    });

    // -----------------------------------------------------------------------
    // Doc Summarizing Playground
    // -----------------------------------------------------------------------
    describe('DocSummarizingPlayground', () => {
      it('handles chip selection, textarea custom input, output generation, and empty state disable', async () => {
        await renderComponent(<DocSummarizingPlayground />);

        const textarea = getByTestId('doc-input-textarea') as HTMLTextAreaElement;
        const summarizeBtn = getByTestId('summarize-btn') as HTMLButtonElement;
        const executionBadge = getByTestId('execution-badge');

        expect(executionBadge).not.toBeNull();
        expect(executionBadge?.textContent).toContain('Demo output, no model ran');

        // Select sample chip 1
        const chip1 = getByTestId('doc-sample-chip-1');
        await act(async () => {
          chip1?.click();
        });

        expect(textarea.value).toContain('Section 4: All customer data processing');

        // Run summary
        await act(async () => {
          summarizeBtn.click();
        });

        await waitMs(450);

        let output = getByTestId('summary-output');
        expect(output?.textContent).toContain('Data Handling Policy');

        // Enter custom input
        await changeInputValue(textarea, 'Custom confidential project brief: Launch local model workshop with zero network traffic.');
        expect(textarea.value).toContain('Custom confidential project brief');

        await act(async () => {
          summarizeBtn.click();
        });

        await waitMs(450);
        output = getByTestId('summary-output');
        expect(output).not.toBeNull();

        // Test empty/whitespace input state
        await changeInputValue(textarea, '   ');
        expect(summarizeBtn.disabled).toBe(true);
      });
    });

    // -----------------------------------------------------------------------
    // Dictation Cleanup Playground
    // -----------------------------------------------------------------------
    describe('DictationCleanupPlayground', () => {
      it('handles ramble selection, custom input, filler word toggle, side-by-side view, and output generation', async () => {
        await renderComponent(<DictationCleanupPlayground />);

        const textarea = getByTestId('dictation-input-textarea') as HTMLTextAreaElement;
        const polishBtn = getByTestId('polish-dictation-btn') as HTMLButtonElement;
        const toggle = getByTestId('filler-cleanup-toggle') as HTMLInputElement;

        expect(toggle.checked).toBe(true);

        // Select ramble chip 1
        const chip1 = getByTestId('ramble-chip-1');
        await act(async () => {
          chip1?.click();
        });

        expect(textarea.value).toContain('Um okay so for the model catalog');

        // Run Polish with filler cleanup enabled
        await act(async () => {
          polishBtn.click();
        });

        await waitMs(450);

        let polishedView = getByTestId('polished-memo-view');
        expect(polishedView?.textContent).toContain('Model Catalog Design Requirements');
        expect(polishedView?.textContent).toContain('[Refined with filler word removal active]');

        // Toggle filler word removal OFF
        await act(async () => {
          toggle.click();
        });

        // Run Polish with filler cleanup disabled
        await act(async () => {
          polishBtn.click();
        });

        await waitMs(450);

        polishedView = getByTestId('polished-memo-view');
        expect(polishedView?.textContent).not.toContain('[Refined with filler word removal active]');

        // Test empty input disabled state
        await changeInputValue(textarea, '');
        expect(polishBtn.disabled).toBe(true);
      });
    });

    // -----------------------------------------------------------------------
    // File Chatting Playground
    // -----------------------------------------------------------------------
    describe('FileChattingPlayground', () => {
      it('handles doc switching, query chip selection, custom queries, Enter keypress, and citations', async () => {
        await renderComponent(<FileChattingPlayground />);

        const textarea = getByTestId('chat-input-textarea') as HTMLTextAreaElement;
        const sendBtn = getByTestId('send-query-btn') as HTMLButtonElement;
        const qaFeed = getByTestId('qa-feed-container');

        expect(qaFeed?.textContent).toContain('Hello! I am connected to your selected local document');

        // Select preset query chip 0
        const queryChip0 = getByTestId('query-chip-0');
        await act(async () => {
          queryChip0?.click();
        });

        expect(textarea.value).toContain('What local models run on 8GB RAM Macs?');

        // Send query via button
        await act(async () => {
          sendBtn.click();
        });

        await waitMs(450);

        expect(qaFeed?.textContent).toContain('Macs with 8GB RAM run 3B parameter models');
        expect(getByTestId('document-citation')).not.toBeNull();

        // Switch document context to doc 1
        const docChip1 = getByTestId('doc-selector-chip-1');
        await act(async () => {
          docChip1?.click();
        });

        expect(qaFeed?.textContent).toContain('Switched local context');

        // Test custom query via Enter keypress
        await changeInputValue(textarea, 'What privacy guarantees are provided?');

        await act(async () => {
          textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        });

        await waitMs(450);

        expect(qaFeed?.textContent).toContain('does not check network isolation, storage or logging');

        // Empty query disable state
        await changeInputValue(textarea, '');
        expect(sendBtn.disabled).toBe(true);
      });
    });
  });

  // =========================================================================
  // 4. Non-Technical UI Integrity & Anti-Leak Assertions
  // =========================================================================
  describe('4. Non-Technical UI Integrity & Anti-Leak Assertions', () => {
    it('asserts zero <pre> tags, zero <code> tags, zero raw JSON dumps, and zero mustache syntax ({{input}}) exist in Task Wizard', async () => {
      await renderComponent(<TaskWizard />);

      const preTags = container?.querySelectorAll('pre');
      const codeTags = container?.querySelectorAll('code');
      expect(preTags?.length).toBe(0);
      expect(codeTags?.length).toBe(0);

      const html = container?.innerHTML || '';
      expect(html).not.toMatch(/\{\s*".*":/); // Raw JSON dump check
      expect(html).not.toMatch(/\{\{\s*[\w\.]+\s*\}\}/); // Mustache syntax check
    });

    it('asserts zero <pre> tags, zero <code> tags, zero raw JSON dumps, and zero mustache syntax ({{input}}) exist in Model Catalog', async () => {
      await renderComponent(<ModelCatalog />);

      const preTags = container?.querySelectorAll('pre');
      const codeTags = container?.querySelectorAll('code');
      expect(preTags?.length).toBe(0);
      expect(codeTags?.length).toBe(0);

      const html = container?.innerHTML || '';
      expect(html).not.toMatch(/\{\s*".*":/);
      expect(html).not.toMatch(/\{\{\s*[\w\.]+\s*\}\}/);
    });

    it('asserts zero <pre> tags, zero <code> tags, zero raw JSON dumps, and zero mustache syntax ({{input}}) exist across Use Case Studio & Playgrounds', async () => {
      await renderComponent(
        <div>
          <UseCaseStudio />
          <VoiceTranscriptionPlayground />
          <DocSummarizingPlayground />
          <DictationCleanupPlayground />
          <FileChattingPlayground />
        </div>
      );

      const preTags = container?.querySelectorAll('pre');
      const codeTags = container?.querySelectorAll('code');
      expect(preTags?.length).toBe(0);
      expect(codeTags?.length).toBe(0);

      const html = container?.innerHTML || '';
      expect(html).not.toMatch(/\{\s*".*":/);
      expect(html).not.toMatch(/\{\{\s*[\w\.]+\s*\}\}/);
    });

    it('asserts full App rendering contains zero <pre>/<code> tags when activeTab is wizard, catalog, or studio', async () => {
      for (const tab of ['wizard', 'catalog', 'studio'] as const) {
        await renderComponent(<App initialTab={tab} />);

        const preTags = container?.querySelectorAll('pre');
        const codeTags = container?.querySelectorAll('code');
        expect(preTags?.length).toBe(0);
        expect(codeTags?.length).toBe(0);

        const html = container?.innerHTML || '';
        expect(html).not.toMatch(/\{\s*".*":/);
        expect(html).not.toMatch(/\{\{\s*[\w\.]+\s*\}\}/);
      }
    });
  });
});
