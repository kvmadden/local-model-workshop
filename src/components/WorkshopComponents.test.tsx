/**
 * WorkshopComponents.test.tsx
 * Unit and integration tests for the workshop components:
 * Layout, Navigation, Hero, TaskWizard, ModelCatalog, and 4 Playgrounds.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// HERMETIC BY CONSTRUCTION (2026-08-06). These are UNIT tests and they assert on
// the playgrounds' DEMO output — canned strings like "Executive Financial". But
// the playgrounds pick their mode at runtime: with a matching model tag actually
// installed in Ollama they run LIVE and stream from the real engine, so the demo
// string never appears and the assertion fails.
//
// Without a stub, this suite passes only on machines where Ollama is not
// installed. On a machine with a matching model, two tests fail against real
// model output. An unmocked suite would be slow, machine-dependent, and would
// spend inference testing string equality against a nondeterministic generator.
//
// So the engine is pinned UNAVAILABLE here. Only the status probe is stubbed —
// everything else in the service stays real via importActual — which forces the
// deterministic demo path without hiding the rest of the module from the tests.
// Live-engine behaviour belongs in an e2e test that can require an engine, not
// in a jsdom unit suite that silently changes meaning based on what is running.
vi.mock('../services/ollamaService', async () => {
  const actual = await vi.importActual<typeof import('../services/ollamaService')>('../services/ollamaService');
  return { ...actual, checkOllamaStatus: vi.fn(async () => ({ available: false, models: [] })) };
});

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Header } from './Header';
import { Hero } from './Hero';
import { TaskWizard } from './TaskWizard';
import { ModelCatalog } from './ModelCatalog';
import { UseCaseStudio } from './UseCaseStudio';
import { VoiceTranscriptionPlayground } from './playgrounds/VoiceTranscriptionPlayground';
import { DocSummarizingPlayground } from './playgrounds/DocSummarizingPlayground';
import { DictationCleanupPlayground } from './playgrounds/DictationCleanupPlayground';
import { FileChattingPlayground } from './playgrounds/FileChattingPlayground';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Workshop component unit tests', () => {
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

  const waitMs = async (ms = 450) => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  };

  // =========================================================================
  // Header & Hero Components
  // =========================================================================
  describe('Header & Hero layout', () => {
    it('Header renders title, subtitle, and 4 navigation tab buttons', async () => {
      const handleTabChange = vi.fn();
      await renderComponent(<Header activeTab="wizard" onTabChange={handleTabChange} />);

      expect(getByTestId('workshop-header')).not.toBeNull();
      expect(getByTestId('workshop-title')?.textContent).toContain('Local Model Workshop');
      expect(getByTestId('workshop-subtitle')?.textContent).toContain('A test bench for local models reading medication instructions');
      expect(getByTestId('tab-run-comparison')).not.toBeNull();
      expect(getByTestId('tab-task-wizard')).not.toBeNull();
      expect(getByTestId('tab-model-catalog')).not.toBeNull();
      expect(getByTestId('tab-use-case-studio')).not.toBeNull();
      expect(getByTestId('tab-flow-builder')).not.toBeNull();
    });

    it('Header tab buttons trigger onTabChange callback', async () => {
      const handleTabChange = vi.fn();
      await renderComponent(<Header activeTab="wizard" onTabChange={handleTabChange} />);

      const catalogTab = getByTestId('tab-model-catalog');
      await act(async () => {
        catalogTab?.click();
      });
      expect(handleTabChange).toHaveBeenCalledWith('catalog');

      const studioTab = getByTestId('tab-use-case-studio');
      await act(async () => {
        studioTab?.click();
      });
      expect(handleTabChange).toHaveBeenCalledWith('studio');
    });

    it('Hero component renders non-technical headline, subtitle, and 4 hardware/privacy badges', async () => {
      await renderComponent(<Hero />);

      expect(getByTestId('hero-section')).not.toBeNull();
      expect(getByTestId('hero-headline')?.textContent).toContain('Small Local Models on Your Mac');
      expect(getByTestId('hero-subtitle')?.textContent).toContain('Find small models that fit your Mac');
      expect(getByTestId('hero-badge-privacy')).not.toBeNull();
      expect(getByTestId('hero-badge-gpu')).not.toBeNull();
      expect(getByTestId('hero-badge-silicon')).not.toBeNull();
      expect(getByTestId('hero-badge-zero-code')).not.toBeNull();
    });

    it('Enforces Non-Technical Design Rule: ZERO raw code (<pre>/<code>) blocks in Hero & Header', async () => {
      await renderComponent(
        <div>
          <Header activeTab="wizard" onTabChange={() => {}} />
          <Hero />
        </div>
      );

      const preElements = container?.querySelectorAll('pre');
      const codeElements = container?.querySelectorAll('code');
      expect(preElements?.length).toBe(0);
      expect(codeElements?.length).toBe(0);
    });
  });

  // =========================================================================
  // TaskWizard & ModelCatalog Components
  // =========================================================================
  describe('TaskWizard & ModelCatalog', () => {
    it('TaskWizard renders goal options, recommendation card, and setup steps', async () => {
      await renderComponent(<TaskWizard />);

      expect(getByTestId('task-wizard-container')).not.toBeNull();
      expect(getByTestId('wizard-heading')).not.toBeNull();
      expect(getByTestId('task-option-transcribe-meetings')).not.toBeNull();
      expect(getByTestId('task-recommendation-card')).not.toBeNull();
      expect(getByTestId('recommended-app')).not.toBeNull();
      expect(getByTestId('recommended-model')).not.toBeNull();
      expect(getByTestId('setup-steps-list')).not.toBeNull();
    });

    it('TaskWizard updates recommendation card when a different goal is selected', async () => {
      await renderComponent(<TaskWizard />);

      const docSearchGoal = getByTestId('task-option-document-search');
      await act(async () => {
        docSearchGoal?.click();
      });

      expect(getByTestId('recommended-app')?.textContent).toBe('AnythingLLM');
      expect(getByTestId('recommended-model')?.textContent).toContain('Llama 3.2');
    });

    it('TaskWizard opens and closes setup guide modal', async () => {
      await renderComponent(<TaskWizard />);

      const openModalBtn = getByTestId('view-setup-guide-btn');
      await act(async () => {
        openModalBtn?.click();
      });

      expect(getByTestId('task-setup-modal')).not.toBeNull();

      const closeModalBtn = getByTestId('close-task-modal-btn');
      await act(async () => {
        closeModalBtn?.click();
      });

      expect(getByTestId('task-setup-modal')).toBeNull();
    });

    it('ModelCatalog renders model cards for premier local models', async () => {
      await renderComponent(<ModelCatalog />);

      expect(getByTestId('model-catalog-container')).not.toBeNull();
      expect(getByTestId('catalog-heading')).not.toBeNull();
      expect(getByTestId('model-card-llama-3.2-3b')).not.toBeNull();
      expect(getByTestId('model-card-qwen-2.5-7b')).not.toBeNull();
      expect(getByTestId('model-card-deepseek-r1-8b')).not.toBeNull();
      expect(getByTestId('model-card-whisper-large-v3')).not.toBeNull();
      expect(getByTestId('model-card-phi-3.5-mini')).not.toBeNull();
    });

    it('ModelCatalog RAM requirement filter filters models accurately', async () => {
      await renderComponent(<ModelCatalog />);

      const filter8gbBtn = getByTestId('ram-filter-8gb');
      await act(async () => {
        filter8gbBtn?.click();
      });

      expect(getByTestId('model-card-llama-3.2-3b')).not.toBeNull();
      expect(getByTestId('model-card-whisper-large-v3')).not.toBeNull();
      expect(getByTestId('model-card-qwen-2.5-7b')).toBeNull();

      const filter16gbBtn = getByTestId('ram-filter-16gb');
      await act(async () => {
        filter16gbBtn?.click();
      });

      expect(getByTestId('model-card-qwen-2.5-7b')).not.toBeNull();
      expect(getByTestId('model-card-deepseek-r1-8b')).not.toBeNull();
      expect(getByTestId('model-card-llama-3.2-3b')).toBeNull();

      const filterAllBtn = getByTestId('ram-filter-all');
      await act(async () => {
        filterAllBtn?.click();
      });

      expect(getByTestId('model-card-llama-3.2-3b')).not.toBeNull();
      expect(getByTestId('model-card-qwen-2.5-7b')).not.toBeNull();
    });

    it('ModelCatalog setup modal opens and displays 1-click zero-code setup steps', async () => {
      await renderComponent(<ModelCatalog />);

      const setupBtn = getByTestId('setup-modal-btn-llama-3.2-3b');
      await act(async () => {
        setupBtn?.click();
      });

      expect(getByTestId('model-setup-modal')).not.toBeNull();

      const closeModalBtn = getByTestId('close-modal-btn');
      await act(async () => {
        closeModalBtn?.click();
      });

      expect(getByTestId('model-setup-modal')).toBeNull();
    });
  });

  // =========================================================================
  // Use Case Studio & 4 Playgrounds
  // =========================================================================
  describe('Use Case Studio & 4 Playgrounds', () => {
    it('UseCaseStudio renders sub-navigation and switches playgrounds cleanly', async () => {
      await renderComponent(<UseCaseStudio />);

      expect(getByTestId('use-case-studio-container')).not.toBeNull();
      expect(getByTestId('playground-selector')).not.toBeNull();
      expect(getByTestId('voice-transcription-playground')).not.toBeNull();

      const summarizationTab = getByTestId('usecase-tab-summarizing');
      await act(async () => {
        summarizationTab?.click();
      });
      expect(getByTestId('doc-summarizing-playground')).not.toBeNull();

      const dictationTab = getByTestId('usecase-tab-dictation');
      await act(async () => {
        dictationTab?.click();
      });
      expect(getByTestId('dictation-cleanup-playground')).not.toBeNull();

      const fileChatTab = getByTestId('usecase-tab-file-chat');
      await act(async () => {
        fileChatTab?.click();
      });
      expect(getByTestId('file-chatting-playground')).not.toBeNull();
    });

    it('VoiceTranscriptionPlayground supports sample audio selection and transcription output generation', async () => {
      await renderComponent(<VoiceTranscriptionPlayground />);

      expect(getByTestId('voice-transcription-playground')).not.toBeNull();
      expect(getByTestId('audio-waveform-visualizer')).not.toBeNull();

      const sampleChip1 = getByTestId('audio-sample-chip-1');
      await act(async () => {
        sampleChip1?.click();
      });

      const transcribeBtn = getByTestId('transcribe-btn');
      await act(async () => {
        transcribeBtn?.click();
      });

      await waitMs(500);

      const transcriptOutput = getByTestId('transcript-output');
      expect(transcriptOutput?.textContent).toContain('Client Lead');
    });

    it('DocSummarizingPlayground processes document summaries and labels demo output as demo', async () => {
      await renderComponent(<DocSummarizingPlayground />);

      expect(getByTestId('doc-summarizing-playground')).not.toBeNull();
      expect(getByTestId('execution-badge')).not.toBeNull();

      const sampleChip0 = getByTestId('doc-sample-chip-0');
      await act(async () => {
        sampleChip0?.click();
      });

      const summarizeBtn = getByTestId('summarize-btn');
      await act(async () => {
        summarizeBtn?.click();
      });

      await waitMs(500);

      const summaryOutput = getByTestId('summary-output');
      expect(summaryOutput?.textContent).toContain('Executive Financial');
    });

    it('DictationCleanupPlayground supports filler word toggle and side-by-side polished view', async () => {
      await renderComponent(<DictationCleanupPlayground />);

      expect(getByTestId('dictation-cleanup-playground')).not.toBeNull();
      expect(getByTestId('filler-cleanup-toggle')).not.toBeNull();
      expect(getByTestId('spoken-ramble-view')).not.toBeNull();
      expect(getByTestId('polished-memo-view')).not.toBeNull();

      const polishBtn = getByTestId('polish-dictation-btn');
      await act(async () => {
        polishBtn?.click();
      });

      await waitMs(500);

      const polishedView = getByTestId('polished-memo-view');
      expect(polishedView?.textContent).toContain('Project Status Update');
    });

    it('FileChattingPlayground supports query chips, local Q&A feed, and document citations', async () => {
      await renderComponent(<FileChattingPlayground />);

      expect(getByTestId('file-chatting-playground')).not.toBeNull();
      expect(getByTestId('qa-feed-container')).not.toBeNull();

      const queryChip0 = getByTestId('query-chip-0');
      await act(async () => {
        queryChip0?.click();
      });

      const sendBtn = getByTestId('send-query-btn');
      await act(async () => {
        sendBtn?.click();
      });

      await waitMs(500);

      const qaFeed = getByTestId('qa-feed-container');
      expect(qaFeed?.textContent).toContain('Llama 3.2');
      expect(getByTestId('document-citation')).not.toBeNull();
    });

    it('Enforces Non-Technical Design Rules across all 4 playgrounds: ZERO raw code blocks (<pre>/<code>)', async () => {
      await renderComponent(
        <div>
          <VoiceTranscriptionPlayground />
          <DocSummarizingPlayground />
          <DictationCleanupPlayground />
          <FileChattingPlayground />
        </div>
      );

      const preElements = container?.querySelectorAll('pre');
      const codeElements = container?.querySelectorAll('code');
      expect(preElements?.length).toBe(0);
      expect(codeElements?.length).toBe(0);
    });
  });
});
