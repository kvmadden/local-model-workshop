import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkOllamaStatus,
  resolveOllamaModelTag,
  generateStream,
  chatStream,
} from './ollamaService';
import { OllamaModel } from '../types/workshop';

describe('ollamaService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveOllamaModelTag', () => {
    const availableModels: OllamaModel[] = [
      { name: 'llama3.2:latest', size: 2000000000, modified_at: '2026-01-01' },
      { name: 'qwen2.5:7b', size: 4500000000, modified_at: '2026-01-01' },
      { name: 'deepseek-r1:8b', size: 5000000000, modified_at: '2026-01-01' },
      { name: 'phi3.5:latest', size: 2500000000, modified_at: '2026-01-01' },
    ];

    it('resolves Llama 3.2 (3B) to llama3.2:latest', () => {
      const tag = resolveOllamaModelTag('Llama 3.2 (3B)', availableModels);
      expect(tag).toBe('llama3.2:latest');
    });

    it('resolves Qwen 2.5 (7B) to qwen2.5:7b', () => {
      const tag = resolveOllamaModelTag('Qwen 2.5 (7B)', availableModels);
      expect(tag).toBe('qwen2.5:7b');
    });

    it('resolves DeepSeek-R1 (8B) to deepseek-r1:8b', () => {
      const tag = resolveOllamaModelTag('DeepSeek-R1 (8B)', availableModels);
      expect(tag).toBe('deepseek-r1:8b');
    });

    it('resolves Phi-3.5 (3.8B) to phi3.5:latest', () => {
      const tag = resolveOllamaModelTag('Phi-3.5 (3.8B)', availableModels);
      expect(tag).toBe('phi3.5:latest');
    });

    it('returns null when no matching model is installed', () => {
      const tag = resolveOllamaModelTag('Mistral 7B', availableModels);
      expect(tag).toBeNull();
    });

    it('handles empty available models list gracefully', () => {
      expect(resolveOllamaModelTag('Llama 3.2', [])).toBeNull();
    });
  });

  describe('checkOllamaStatus', () => {
    it('returns available: true and model list on successful response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama3.2:latest', size: 2000000000, modified_at: '2026-01-01' },
          ],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const res = await checkOllamaStatus();
      expect(res.available).toBe(true);
      expect(res.models.length).toBe(1);
      expect(res.models[0].name).toBe('llama3.2:latest');
    });

    it('returns available: false on fetch error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const res = await checkOllamaStatus();
      expect(res.available).toBe(false);
      expect(res.models).toEqual([]);
    });
  });

  describe('generateStream', () => {
    it('streams response chunks from NDJSON stream', async () => {
      const chunks = [
        JSON.stringify({ response: 'Hello ', done: false }) + '\n',
        JSON.stringify({ response: 'world!', done: true }) + '\n',
      ];

      const encoder = new TextEncoder();
      let streamIndex = 0;

      const mockReader = {
        read: vi.fn().mockImplementation(async () => {
          if (streamIndex < chunks.length) {
            const value = encoder.encode(chunks[streamIndex++]);
            return { done: false, value };
          }
          return { done: true, value: undefined };
        }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });
      vi.stubGlobal('fetch', mockFetch);

      const received: string[] = [];
      await generateStream('llama3.2:latest', 'Hi', (chunk) => {
        received.push(chunk);
      });

      expect(received).toEqual(['Hello ', 'world!']);
    });
  });

  describe('chatStream', () => {
    it('streams chat message content chunks from NDJSON stream', async () => {
      const chunks = [
        JSON.stringify({ message: { role: 'assistant', content: 'Chat ' }, done: false }) + '\n',
        JSON.stringify({ message: { role: 'assistant', content: 'response' }, done: true }) + '\n',
      ];

      const encoder = new TextEncoder();
      let streamIndex = 0;

      const mockReader = {
        read: vi.fn().mockImplementation(async () => {
          if (streamIndex < chunks.length) {
            const value = encoder.encode(chunks[streamIndex++]);
            return { done: false, value };
          }
          return { done: true, value: undefined };
        }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });
      vi.stubGlobal('fetch', mockFetch);

      const received: string[] = [];
      await chatStream(
        'llama3.2:latest',
        [{ role: 'user', content: 'Hi' }],
        (chunk) => {
          received.push(chunk);
        }
      );

      expect(received).toEqual(['Chat ', 'response']);
    });
  });
});
