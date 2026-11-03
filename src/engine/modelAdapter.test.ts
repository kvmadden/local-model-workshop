import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MockAdapter,
  OllamaAdapter,
  OpenAIAdapter,
  UnifiedModelAdapter,
  defaultModelAdapter,
} from './modelAdapter';
import { ModelConfig } from '../types/flow';

describe('ModelAdapters', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('MockAdapter', () => {
    it('delegates prompt execution to mock endpoint', async () => {
      const adapter = new MockAdapter();
      const config: ModelConfig = {
        provider: 'mock',
        model: 'test-mock',
        temperature: 0.5,
        mockPattern: 'echo',
        mockLatencyMs: 10,
      };

      const result = await adapter.executePrompt('Mock input', config);
      expect(result.text).toBe('[Mock Echo] Mock input');
      expect(result.latencyMs).toBeGreaterThanOrEqual(5);
    });
  });

  describe('OllamaAdapter', () => {
    it('executes prompt against local Ollama REST API successfully', async () => {
      const mockResponse = {
        model: 'llama3',
        created_at: '2026-07-30T21:00:00Z',
        response: 'Ollama model output text',
        done: true,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      }) as any;

      const adapter = new OllamaAdapter();
      const config: ModelConfig = {
        provider: 'ollama',
        model: 'llama3',
        temperature: 0.8,
      };

      const result = await adapter.executePrompt('Explain gravity', config);

      expect(result.text).toBe('Ollama model output text');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama3',
            prompt: 'Explain gravity',
            stream: false,
            options: { temperature: 0.8 },
          }),
        })
      );
    });

    it('passes format and think through to Ollama only when set', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ response: '{"a":1}' }),
      }) as any;

      const schema = { type: 'object', properties: { a: { type: 'number' } } };
      const adapter = new OllamaAdapter();
      await adapter.executePrompt('x', {
        provider: 'ollama',
        model: 'm',
        temperature: 0,
        format: schema,
        think: false,
      });
      const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
      expect(body.format).toEqual(schema);
      expect(body.think).toBe(false);
      expect(body.options).toEqual({ temperature: 0 });

      await adapter.executePrompt('x', { provider: 'ollama', model: 'm' });
      const body2 = JSON.parse((globalThis.fetch as any).mock.calls[1][1].body);
      expect('format' in body2).toBe(false);
      expect('think' in body2).toBe(false);
    });

    it('honors custom endpointUrl override for Ollama', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ response: 'Custom endpoint answer' }),
      }) as any;

      const adapter = new OllamaAdapter();
      const config: ModelConfig = {
        provider: 'ollama',
        model: 'codellama',
        temperature: 0.2,
        endpointUrl: 'http://192.168.1.100:11434/api/generate',
        // A server on another machine receives the prompt text, so it must be allowed explicitly.
        allowRemote: true,
      };

      const result = await adapter.executePrompt('Write a function', config);
      expect(result.text).toBe('Custom endpoint answer');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://192.168.1.100:11434/api/generate',
        expect.anything()
      );
    });

    it('handles HTTP error statuses from Ollama endpoint', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Model failed to load',
      }) as any;

      const adapter = new OllamaAdapter();
      const config: ModelConfig = {
        provider: 'ollama',
        model: 'llama3',
        temperature: 0.7,
      };

      await expect(adapter.executePrompt('Test prompt', config)).rejects.toThrow(
        'Ollama execution failed: Ollama endpoint returned HTTP 500: Model failed to load'
      );
    });

    it('handles network failure during fetch to Ollama', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as any;

      const adapter = new OllamaAdapter();
      const config: ModelConfig = {
        provider: 'ollama',
        model: 'llama3',
        temperature: 0.7,
      };

      await expect(adapter.executePrompt('Test prompt', config)).rejects.toThrow(
        'Ollama execution failed: Failed to fetch'
      );
    });
  });

  describe('OpenAIAdapter', () => {
    it('executes prompt against OpenAI API successfully with API key and headers', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'OpenAI assistant answer',
            },
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      }) as any;

      const adapter = new OpenAIAdapter();
      const config: ModelConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.7,
        apiKey: 'sk-test-secret-key',
        allowRemote: true,
        systemPrompt: 'You are a helpful coding assistant.',
        maxTokens: 500,
      };

      const result = await adapter.executePrompt('Write typescript interface', config);

      expect(result.text).toBe('OpenAI assistant answer');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer sk-test-secret-key',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: 'You are a helpful coding assistant.' },
              { role: 'user', content: 'Write typescript interface' },
            ],
            temperature: 0.7,
            max_tokens: 500,
          }),
        })
      );
    });

    it('handles 401 Unauthorized API key error from OpenAI', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key',
      }) as any;

      const adapter = new OpenAIAdapter();
      const config: ModelConfig = {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        apiKey: 'invalid-key',
        allowRemote: true,
      };

      await expect(adapter.executePrompt('Test prompt', config)).rejects.toThrow(
        'OpenAI execution failed: OpenAI API returned HTTP 401: Invalid API key'
      );
    });
  });

  describe('UnifiedModelAdapter', () => {
    it('routes request to mock adapter when provider is mock', async () => {
      const unified = new UnifiedModelAdapter();
      const config: ModelConfig = {
        provider: 'mock',
        model: 'mock-1',
        temperature: 0.7,
        mockPattern: 'custom',
        mockCustomResponse: 'Unified mock output',
        mockLatencyMs: 5,
      };

      const result = await unified.executePrompt('Unified test', config);
      expect(result.text).toBe('Unified mock output');
    });

    it('routes request to Ollama adapter when provider is ollama', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ response: 'Ollama routed response' }),
      }) as any;

      const unified = new UnifiedModelAdapter();
      const config: ModelConfig = {
        provider: 'ollama',
        model: 'llama3',
        temperature: 0.7,
      };

      const result = await unified.executePrompt('Unified test', config);
      expect(result.text).toBe('Ollama routed response');
    });

    it('routes request to OpenAI adapter when provider is openai', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'OpenAI routed response' } }],
        }),
      }) as any;

      const unified = new UnifiedModelAdapter();
      const config: ModelConfig = {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        endpointUrl: 'http://127.0.0.1:1234/v1/chat/completions',
      };

      const result = await unified.executePrompt('Unified test', config);
      expect(result.text).toBe('OpenAI routed response');
    });

    it('throws error when provider is unsupported', async () => {
      const unified = new UnifiedModelAdapter();
      const config = {
        provider: 'unsupported-provider' as any,
        model: 'unknown',
        temperature: 0.7,
      };

      await expect(unified.executePrompt('Test', config)).rejects.toThrow(
        "Unsupported model provider: 'unsupported-provider'"
      );
    });

    it('provides a valid defaultModelAdapter singleton instance', async () => {
      const config: ModelConfig = {
        provider: 'mock',
        model: 'singleton-test',
        temperature: 0.7,
        mockPattern: 'echo',
        mockLatencyMs: 5,
      };

      const result = await defaultModelAdapter.executePrompt('Singleton test', config);
      expect(result.text).toBe('[Mock Echo] Singleton test');
    });
  });
});
