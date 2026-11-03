/**
 * An Ollama that does not answer within the probe deadline is "not reached", not "not
 * installed". The detector names what blocked the read and lists installing as one possibility.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/ollamaService', async () => {
  const actual = await vi.importActual<typeof import('../services/ollamaService')>('../services/ollamaService');
  return { ...actual, checkOllamaStatus: vi.fn(async () => ({ available: false, models: [], reason: 'no answer within 2 s' })) };
});

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { OllamaDetector } from './OllamaDetector';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Ollama detector', () => {
  it('reports why Ollama was not reached instead of saying it is not installed', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(OllamaDetector));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const text = container.textContent ?? '';
    expect(text).toContain('Ollama not reached');
    expect(text).toContain('no answer within 2 s');
    expect(text).toContain('or it may not be installed');
    expect(text).not.toContain('not detected');
    await act(async () => root.unmount());
    container.remove();
  });
});
