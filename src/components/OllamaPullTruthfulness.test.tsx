/**
 * OllamaPullTruthfulness.test.tsx
 *
 * Guard for the defect found 2026-08-24: the catalog offered a
 * copy-to-clipboard `ollama pull whisper` on the Whisper Large-v3 card and in
 * the detector's status list. Ollama does not serve Whisper — it serves text
 * models, and Whisper runs under whisper.cpp / MacWhisper. Verified the same
 * day with
 *   curl -o /dev/null -w '%{http_code}' -L https://ollama.com/library/whisper
 * which returns 404, while llama3.2, qwen2.5, deepseek-r1 and phi3.5 all
 * return 200. The entry's own `appPairing` already said "MacWhisper & Open
 * WebUI", so the card was contradicting its own data.
 *
 * `ollamaPull: null` is the representation of "Ollama does not serve this".
 * These tests assert the two rules that follow from it, on the REAL catalog
 * data rather than a fixture, so a future entry that reintroduces a bogus pull
 * command fails here.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../services/ollamaService', async () => {
  const actual = await vi.importActual<typeof import('../services/ollamaService')>('../services/ollamaService');
  return { ...actual, checkOllamaStatus: vi.fn(async () => ({ available: false, models: [] })) };
});

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ModelCatalog } from './ModelCatalog';
import { MODELS_DATA } from '../data/models';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Models Ollama is known NOT to serve. Each entry records the verification.
const NOT_SERVED_BY_OLLAMA: Record<string, string> = {
  'whisper-large-v3': 'https://ollama.com/library/whisper -> 404 (verified 2026-08-24)',
};

describe('catalog pull commands are truthful about what Ollama serves', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => { root?.unmount(); });
      container.remove();
    }
    root = null;
    container = null;
  });

  it('carries ollamaPull === null for every model Ollama does not serve', () => {
    for (const [id, evidence] of Object.entries(NOT_SERVED_BY_OLLAMA)) {
      const entry = MODELS_DATA.find((m) => m.id === id);
      expect(entry, `catalog entry ${id} is missing`).toBeTruthy();
      expect(entry!.ollamaPull, `${id}: ${evidence}`).toBeNull();
    }
  });

  it('never ships an empty-string pull command (null is the only "no command")', () => {
    for (const model of MODELS_DATA) {
      expect(model.ollamaPull === null || model.ollamaPull.startsWith('ollama pull ')).toBe(true);
    }
  });

  it('renders no copy-pull button for a not-served model, and names its setup path instead', async () => {
    await act(async () => { root!.render(React.createElement(ModelCatalog)); });

    for (const id of Object.keys(NOT_SERVED_BY_OLLAMA)) {
      const entry = MODELS_DATA.find((m) => m.id === id)!;
      const card = container!.querySelector(`[data-testid="model-card-${id}"]`);
      expect(card, `card ${id} did not render`).toBeTruthy();

      expect(
        container!.querySelector(`[data-testid="copy-pull-cmd-${id}"]`),
        `${id} must not offer a pull command Ollama would 404 on`,
      ).toBeNull();

      const path = container!.querySelector(`[data-testid="no-ollama-path-${id}"]`);
      expect(path, `${id} must name its real setup path`).toBeTruthy();
      expect(path!.textContent).toContain(entry.appPairing);
    }
  });

  it('still renders the copy-pull button for models Ollama does serve', async () => {
    await act(async () => { root!.render(React.createElement(ModelCatalog)); });

    const served = MODELS_DATA.filter((m) => m.ollamaPull !== null);
    expect(served.length).toBeGreaterThan(0);
    for (const model of served) {
      expect(
        container!.querySelector(`[data-testid="copy-pull-cmd-${model.id}"]`),
        `${model.id} lost its pull button`,
      ).toBeTruthy();
    }
  });
});
