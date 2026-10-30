/**
 * TruthfulLiveLabeling.test.tsx
 *
 * The workshop must never present synthetic output as real model output.
 *
 * Two facts used to combine into a falsehood:
 *   1. Every playground renders its labels off `mode === 'live'` — "Live Local
 *      Ollama Streaming", `Engine: Ollama (<tag>)`, "Streaming Live Transcript
 *      via Ollama" — and SharedPlayground suppresses the demo banner whenever
 *      mode is not 'demo'.
 *   2. Every `handleRun*` falls back to its hardcoded `runDemo*()` sample when
 *      `isLiveAvailable` is false.
 *
 * While `mode` was plain state, the "Live Ollama Mode" toggle was clickable
 * with no engine present. Clicking it set mode='live', the demo banner
 * vanished, and the next run painted a hardcoded synthetic transcript under
 * live labels naming a model that had never been contacted.
 *
 * `mode` is now derived (`isLiveAvailable && requested === 'live'`), so
 * `mode === 'live'` implies a reachable engine with an exact model match.
 * These tests pin that invariant at the rendered surface, where the lie was
 * visible.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hermetic: the status probe must report unavailable, otherwise a real Ollama
// on the developer's machine would satisfy `isLiveAvailable` and these tests
// would assert nothing. Everything else in the service stays real.
vi.mock('../../services/ollamaService', async () => {
  const actual =
    await vi.importActual<typeof import('../../services/ollamaService')>('../../services/ollamaService');
  return { ...actual, checkOllamaStatus: vi.fn(async () => ({ available: false, models: [] })) };
});

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { usePlaygroundState } from '../../hooks/usePlaygroundState';
import { VoiceTranscriptionPlayground } from './VoiceTranscriptionPlayground';
import { DocSummarizingPlayground } from './DocSummarizingPlayground';
import { DictationCleanupPlayground } from './DictationCleanupPlayground';
import { FileChattingPlayground } from './FileChattingPlayground';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Copy that asserts a real model produced what is on screen. */
const LIVE_CLAIM = /Live Local Ollama Streaming|Live Local Ollama Engine|Live Streaming|Engine: Ollama|via Ollama|Polish Live via Ollama|Run Live Transcribe|Re-run Live Transcription/i;

describe('Workshop truthfulness — no synthetic output under live labels', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const render = async (element: React.ReactElement) => {
    await act(async () => {
      root.render(element);
    });
  };

  /**
   * Harness that consumes the hook directly and exposes `setMode`.
   *
   * The rendered playgrounds CANNOT reach the hook's guard, because React reads
   * `disabled` from its own fiber props rather than the DOM: while
   * SharedPlayground passes `disabled={!isLiveAvailable}`, React drops the click
   * before onModeChange runs, and stripping the DOM attribute does not change
   * that. An earlier revision of this file tried exactly that and was vacuous —
   * it stayed green with the hook's guard deleted.
   *
   * So the two guards are proven separately and honestly:
   *   - the AFFORDANCE guard (SharedPlayground `disabled`) by the rendered tests
   *     below, which is what closes the hole for a real user;
   *   - the STRUCTURAL guard (derived `mode`) here, which is what stops any
   *     future caller of setMode from reopening it.
   */
  const ModeHarness: React.FC<{ modelName: string }> = ({ modelName }) => {
    const { mode, isLiveAvailable, matchingTag, setMode } = usePlaygroundState({ modelName });
    return (
      <div>
        <span data-testid="harness-mode">{mode}</span>
        <span data-testid="harness-live-available">{String(isLiveAvailable)}</span>
        <span data-testid="harness-tag">{String(matchingTag)}</span>
        <button type="button" data-testid="harness-request-live" onClick={() => setMode('live')}>
          request live
        </button>
      </div>
    );
  };

  const cases: Array<[string, React.ReactElement]> = [
    ['voice transcription', <VoiceTranscriptionPlayground />],
    ['doc summarizing', <DocSummarizingPlayground />],
    ['dictation cleanup', <DictationCleanupPlayground />],
    ['file chatting', <FileChattingPlayground />],
  ];

  it.each(cases)(
    '%s: the live toggle is not offered while no engine is reachable',
    async (_name, element) => {
      await render(element);

      const liveToggle = container.querySelector<HTMLButtonElement>('[data-testid="mode-toggle-live"]');
      expect(liveToggle).not.toBeNull();
      expect(liveToggle!.disabled).toBe(true);
    }
  );

  it.each(cases)(
    '%s: renders an honest demo surface with no live claim while no engine is reachable',
    async (_name, element) => {
      await render(element);

      // Baseline: honest demo surface before any interaction.
      expect(container.querySelector('[data-testid="demo-preview-banner"]')).not.toBeNull();

      // The demo banner is the single loudest "this is not a real model run"
      // signal. It must survive the request.
      expect(
        container.querySelector('[data-testid="demo-preview-banner"]'),
        'demo banner was suppressed while no engine was reachable'
      ).not.toBeNull();

      expect(
        container.textContent,
        'surface claimed a live model run while no engine was reachable'
      ).not.toMatch(LIVE_CLAIM);
    }
  );

  it.each(cases)(
    '%s: a run with no engine yields synthetic output that is still labelled demo',
    async (_name, element) => {
      await render(element);

      const runBtn = container.querySelector('[data-testid="run-playground-btn"]');
      expect(runBtn).not.toBeNull();

      await act(async () => {
        (runBtn!.closest('button') as HTMLButtonElement).click();
      });
      // The demo paths resolve on a short timer.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 800));
      });

      const output = container.querySelector('[data-testid="playground-output-container"]');
      expect(output).not.toBeNull();
      // Something was rendered — this is the synthetic sample.
      expect(output!.textContent!.trim().length).toBeGreaterThan(0);

      // ...and nothing on the surface says a model produced it.
      expect(
        container.textContent,
        'synthetic sample was rendered under a live model claim'
      ).not.toMatch(LIVE_CLAIM);
      expect(container.querySelector('[data-testid="demo-preview-banner"]')).not.toBeNull();
    }
  );

  it('never reports a live mode without an exact resolved model tag', async () => {
    // `Engine: Ollama (null)` / `Live Streaming (null)` was the tell that mode
    // and capability had come apart. Assert the rendered null can never appear.
    for (const [, element] of cases) {
      await render(element);
      expect(container.textContent).not.toMatch(/\(null\)|\(undefined\)/);
    }
  });

  it('the hook refuses a live request while no engine is reachable', async () => {
    await render(<ModeHarness modelName="Llama 3.2 (3B)" />);

    expect(container.querySelector('[data-testid="harness-live-available"]')!.textContent).toBe('false');
    expect(container.querySelector('[data-testid="harness-tag"]')!.textContent).toBe('null');
    expect(container.querySelector('[data-testid="harness-mode"]')!.textContent).toBe('demo');

    // The call that used to flip every label in the tree.
    const btn = container.querySelector<HTMLButtonElement>('[data-testid="harness-request-live"]')!;
    await act(async () => {
      btn.click();
    });

    expect(
      container.querySelector('[data-testid="harness-mode"]')!.textContent,
      'setMode("live") granted live mode with no reachable engine'
    ).toBe('demo');
  });

  it('the hook keeps refusing live across repeated requests', async () => {
    await render(<ModeHarness modelName="Qwen 2.5 (7B)" />);
    const btn = container.querySelector<HTMLButtonElement>('[data-testid="harness-request-live"]')!;

    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        btn.click();
      });
      expect(container.querySelector('[data-testid="harness-mode"]')!.textContent).toBe('demo');
    }
  });

  it.each(cases)(
    '%s: clicking the live toggle then running cannot produce a live claim (original bug)',
    async (_name, element) => {
      await render(element);

      // The exact user gesture that produced the falsehood: click the green
      // "Live Ollama Mode" toggle with no engine present, then run. With both
      // guards removed this reproduces the original bug — the demo banner
      // disappears and a hardcoded sample renders under live labels.
      const liveToggle = container.querySelector<HTMLButtonElement>('[data-testid="mode-toggle-live"]')!;
      await act(async () => {
        liveToggle.click();
      });

      const runBtn = container.querySelector('[data-testid="run-playground-btn"]')!;
      await act(async () => {
        (runBtn.closest('button') as HTMLButtonElement).click();
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 800));
      });

      expect(
        container.querySelector('[data-testid="demo-preview-banner"]'),
        'demo banner was suppressed after clicking the live toggle with no engine'
      ).not.toBeNull();
      expect(
        container.textContent,
        'synthetic sample rendered under a live model claim after clicking the live toggle'
      ).not.toMatch(LIVE_CLAIM);
      expect(container.textContent).not.toMatch(/\(null\)|\(undefined\)/);
    }
  );
});
