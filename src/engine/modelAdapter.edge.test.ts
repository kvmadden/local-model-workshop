import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  OllamaAdapter,
  OpenAIAdapter,
  defaultModelAdapter,
} from './modelAdapter';
import { MockEndpoint } from './mockEndpoint';
import { ModelConfig } from '../types/flow';

/** A local OpenAI-compatible server (LM Studio's default port). No key is needed on this machine. */
const LOCAL_OPENAI = 'http://127.0.0.1:1234/v1/chat/completions';

describe('Edge cases: MockEndpoint & ModelAdapters', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SECTION 1: Latency Simulation Accuracy & Concurrency Bounds
  // =========================================================================
  describe('1. Latency Simulation Accuracy & Concurrency Bounds', () => {
    it('executes 50 concurrent requests in non-blocking async fashion', async () => {
      const endpoint = new MockEndpoint();
      const concurrency = 50;
      const targetLatencyMs = 80;
      const startTime = Date.now();

      const promises = Array.from({ length: concurrency }, (_, i) =>
        endpoint.generateResponse(`Concurrent prompt ${i}`, {
          provider: 'mock',
          model: 'mock-speed',
          mockLatencyMs: targetLatencyMs,
          mockPattern: 'echo',
          temperature: 0.7,
        })
      );

      const results = await Promise.all(promises);
      const elapsedWallClock = Date.now() - startTime;

      expect(results).toHaveLength(concurrency);
      // Wall clock time should be close to target latency (~80ms), NOT sequential (50 * 80ms = 4000ms)
      expect(elapsedWallClock).toBeLessThan(500);

      // Verify each individual result recorded its latency accurately
      results.forEach((res, i) => {
        expect(res.text).toBe(`[Mock Echo] Concurrent prompt ${i}`);
        expect(res.latencyMs).toBeGreaterThanOrEqual(70);
      });
    });

    it('evaluates latency bounds for edge case values (0, negative, NaN, floating point, undefined)', async () => {
      const endpoint = new MockEndpoint();

      // Zero latency
      const resZero = await endpoint.generateResponse('Zero delay', {
        provider: 'mock',
        model: 'm1',
        mockLatencyMs: 0,
        temperature: 0.7,
      });
      expect(resZero.latencyMs).toBeGreaterThanOrEqual(0);

      // Negative latency (should be treated as non-positive -> no delay)
      const resNeg = await endpoint.generateResponse('Neg delay', {
        provider: 'mock',
        model: 'm1',
        mockLatencyMs: -50,
        temperature: 0.7,
      });
      expect(resNeg.latencyMs).toBeGreaterThanOrEqual(0);

      // NaN latency (NaN > 0 is false -> no delay)
      const resNaN = await endpoint.generateResponse('NaN delay', {
        provider: 'mock',
        model: 'm1',
        mockLatencyMs: NaN,
        temperature: 0.7,
      });
      expect(resNaN.latencyMs).toBeGreaterThanOrEqual(0);

      // Floating point latency (e.g. 15.5ms)
      const resFloat = await endpoint.generateResponse('Float delay', {
        provider: 'mock',
        model: 'm1',
        mockLatencyMs: 15.5,
        temperature: 0.7,
      });
      expect(resFloat.latencyMs).toBeGreaterThanOrEqual(10);

      // Undefined latency (should default to 150ms)
      const startUndef = Date.now();
      const resUndef = await endpoint.generateResponse('Default delay', {
        provider: 'mock',
        model: 'm1',
        mockLatencyMs: undefined,
        temperature: 0.7,
      });
      const durationUndef = Date.now() - startUndef;
      expect(durationUndef).toBeGreaterThanOrEqual(130);
      expect(resUndef.latencyMs).toBeGreaterThanOrEqual(130);
    });
  });

  // =========================================================================
  // SECTION 2: Mock Endpoint Error Triggers under Batch Requests
  // =========================================================================
  describe('2. Error Simulation Triggers under Batch Execution', () => {
    it('isolates failures cleanly in a batch of 50 concurrent requests with mixed error triggers', async () => {
      const endpoint = new MockEndpoint();
      const totalRequests = 50;

      // Prepare 50 configs: index 10, 20, 30, 40 trigger errors, others succeed
      const batchPrompts = Array.from({ length: totalRequests }, (_, i) => {
        let config: ModelConfig = {
          provider: 'mock',
          model: 'gpt-mock',
          mockLatencyMs: 5,
          mockPattern: 'echo',
          temperature: 0.7,
        };
        let promptText = `Batch item ${i}`;

        if (i === 10) {
          config.model = 'mock-error';
        } else if (i === 20) {
          promptText = `Item ${i} [SIMULATE_ERROR] trigger`;
        } else if (i === 30) {
          config.mockPattern = 'error' as any;
        } else if (i === 40) {
          config.model = 'mock-error';
          promptText = `Item ${i} [SIMULATE_ERROR] double trigger`;
        }

        return { promptText, config, index: i };
      });

      const results = await Promise.allSettled(
        batchPrompts.map((item) => endpoint.generateResponse(item.promptText, item.config))
      );

      expect(results).toHaveLength(totalRequests);

      results.forEach((res, i) => {
        if (i === 10 || i === 20 || i === 30 || i === 40) {
          expect(res.status).toBe('rejected');
          if (res.status === 'rejected') {
            expect(res.reason.message).toContain('Simulated mock endpoint error');
          }
        } else {
          expect(res.status).toBe('fulfilled');
          if (res.status === 'fulfilled') {
            expect(res.value.text).toBe(`[Mock Echo] Batch item ${i}`);
          }
        }
      });
    });

    it('preserves error message model metadata fidelity under error triggers', async () => {
      const endpoint = new MockEndpoint();
      const customModelConfig: ModelConfig = {
        provider: 'mock',
        model: 'custom-error-model-name',
        mockLatencyMs: 0,
        temperature: 0.7,
      };

      await expect(
        endpoint.generateResponse('Test [SIMULATE_ERROR]', customModelConfig)
      ).rejects.toThrow("Simulated mock endpoint error for model 'custom-error-model-name'");
    });
  });

  // =========================================================================
  // SECTION 3: Payload Serializations, Headers, and Endpoint Overrides
  // =========================================================================
  describe('3. Payload Serializations, Headers, and Endpoint Overrides', () => {
    describe('OllamaAdapter Payload & Protocol', () => {
      it('serializes exact default payload and endpoint for Ollama', async () => {
        let capturedUrl = '';
        let capturedOptions: any = {};

        globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
          capturedUrl = url;
          capturedOptions = opts;
          return {
            ok: true,
            status: 200,
            json: async () => ({ response: 'Ollama answer' }),
          };
        }) as any;

        const adapter = new OllamaAdapter();
        const config: ModelConfig = {
          provider: 'ollama',
          model: 'llama3',
          temperature: 0.5,
        };

        const res = await adapter.executePrompt('Write poem', config);
        expect(res.text).toBe('Ollama answer');
        expect(capturedUrl).toBe('http://localhost:11434/api/generate');
        expect(capturedOptions.method).toBe('POST');
        expect(capturedOptions.headers['Content-Type']).toBe('application/json');

        const parsedBody = JSON.parse(capturedOptions.body);
        expect(parsedBody).toEqual({
          model: 'llama3',
          prompt: 'Write poem',
          stream: false,
          options: {
            temperature: 0.5,
          },
        });
      });

      it('applies fallback defaults when optional fields are omitted in Ollama config', async () => {
        let capturedBody: any = null;

        globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
          capturedBody = JSON.parse(opts.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({ response: 'Default answer' }),
          };
        }) as any;

        const adapter = new OllamaAdapter();
        // An empty model name used to be replaced with "llama3" without saying so.
        await expect(adapter.executePrompt('Minimal prompt', { provider: 'ollama', model: '' })).rejects.toThrow(
          'Ollama execution failed: Ollama: no model name was given'
        );
        expect(capturedBody).toBeNull();

        await adapter.executePrompt('Minimal prompt', { provider: 'ollama', model: 'llama3' });
        expect(capturedBody.model).toBe('llama3');
        expect(capturedBody.options.temperature).toBe(0.7); // Fallback temperature
      });

      it('overrides endpointUrl when custom URL is specified in Ollama config', async () => {
        let capturedUrl = '';

        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
          capturedUrl = url;
          return {
            ok: true,
            status: 200,
            json: async () => ({ response: 'Remote answer' }),
          };
        }) as any;

        const adapter = new OllamaAdapter();
        const config: ModelConfig = {
          provider: 'ollama',
          model: 'mistral',
          endpointUrl: 'https://ollama.internal.net:8443/api/generate',
          temperature: 0.7,
        };

        // Another machine is refused before anything is sent...
        await expect(adapter.executePrompt('Remote prompt', config)).rejects.toThrow(/refusing to send this prompt to ollama.internal.net:8443/);
        expect(capturedUrl).toBe('');
        // ...unless the step allows it explicitly.
        await adapter.executePrompt('Remote prompt', { ...config, allowRemote: true });
        expect(capturedUrl).toBe('https://ollama.internal.net:8443/api/generate');
      });
    });

    describe('OpenAIAdapter Payload & Protocol', () => {
      it('serializes complete OpenAI request with systemPrompt, maxTokens, and Authorization header', async () => {
        let capturedUrl = '';
        let capturedOptions: any = {};

        globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
          capturedUrl = url;
          capturedOptions = opts;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: 'OpenAI output string' } }],
            }),
          };
        }) as any;

        const adapter = new OpenAIAdapter();
        const config: ModelConfig = {
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.1,
          apiKey: 'fake-test-key',
          allowRemote: true,
          systemPrompt: 'Act as a senior TypeScript architect.',
          maxTokens: 1000,
        };

        const res = await adapter.executePrompt('Design an interface', config);
        expect(res.text).toBe('OpenAI output string');
        expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions');
        expect(capturedOptions.headers['Content-Type']).toBe('application/json');
        expect(capturedOptions.headers['Authorization']).toBe('Bearer fake-test-key');

        const parsedBody = JSON.parse(capturedOptions.body);
        expect(parsedBody).toEqual({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'Act as a senior TypeScript architect.' },
            { role: 'user', content: 'Design an interface' },
          ],
          temperature: 0.1,
          max_tokens: 1000,
        });
      });

      it('omits Authorization header when apiKey is missing or empty', async () => {
        let capturedOptions: any = {};

        globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
          capturedOptions = opts;
          return {
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: 'No auth' } }] }),
          };
        }) as any;

        const adapter = new OpenAIAdapter();
        const config: ModelConfig = {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
          endpointUrl: LOCAL_OPENAI,
        };

        await adapter.executePrompt('No key prompt', config);
        expect(capturedOptions.headers['Authorization']).toBeUndefined();
      });

      it('omits system message when systemPrompt is undefined or empty', async () => {
        let capturedBody: any = null;

        globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
          capturedBody = JSON.parse(opts.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: 'Single msg' } }] }),
          };
        }) as any;

        const adapter = new OpenAIAdapter();
        const config: ModelConfig = {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
          endpointUrl: LOCAL_OPENAI,
        };

        await adapter.executePrompt('User only prompt', config);
        expect(capturedBody.messages).toHaveLength(1);
        expect(capturedBody.messages[0]).toEqual({ role: 'user', content: 'User only prompt' });
        expect(capturedBody.max_tokens).toBeUndefined();
      });

      it('overrides endpointUrl for custom OpenAI-compatible server (e.g. LocalAI or vLLM)', async () => {
        let capturedUrl = '';

        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
          capturedUrl = url;
          return {
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: 'LocalAI response' } }] }),
          };
        }) as any;

        const adapter = new OpenAIAdapter();
        const config: ModelConfig = {
          provider: 'openai',
          model: 'local-model',
          endpointUrl: 'http://localhost:8080/v1/chat/completions',
          temperature: 0.7,
        };

        await adapter.executePrompt('LocalAI test', config);
        expect(capturedUrl).toBe('http://localhost:8080/v1/chat/completions');
      });
    });
  });

  // =========================================================================
  // SECTION 4: Async Error Handling & Network Resilience
  // =========================================================================
  describe('4. Async Error Handling (Network Errors, Non-JSON Bodies, HTTP Failures)', () => {
    it('handles network failure (TypeError: Failed to fetch) in Ollama and OpenAI adapters', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as any;

      const ollama = new OllamaAdapter();
      await expect(
        ollama.executePrompt('Test', { provider: 'ollama', model: 'llama3', temperature: 0.7 })
      ).rejects.toThrow('Ollama execution failed: Failed to fetch');

      const openai = new OpenAIAdapter();
      await expect(
        openai.executePrompt('Test', { provider: 'openai', model: 'gpt-3.5-turbo', temperature: 0.7, endpointUrl: LOCAL_OPENAI })
      ).rejects.toThrow('OpenAI execution failed: Failed to fetch');
    });

    it('handles network timeout / abort errors cleanly', async () => {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new DOMException('The operation was aborted', 'AbortError')) as any;

      const openai = new OpenAIAdapter();
      await expect(
        openai.executePrompt('Test', { provider: 'openai', model: 'gpt-4o', temperature: 0.7, endpointUrl: LOCAL_OPENAI })
      ).rejects.toThrow('OpenAI execution failed: The operation was aborted');
    });

    it('handles non-200 HTTP status codes with plain text or HTML error bodies', async () => {
      // 502 Bad Gateway with HTML body
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => '<html><body>502 Bad Gateway</body></html>',
      }) as any;

      const ollama = new OllamaAdapter();
      await expect(
        ollama.executePrompt('Test', { provider: 'ollama', model: 'llama3', temperature: 0.7 })
      ).rejects.toThrow(
        'Ollama execution failed: Ollama endpoint returned HTTP 502: <html><body>502 Bad Gateway</body></html>'
      );

      // 403 Forbidden with empty text body (simulating fallback to statusText)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => '',
      }) as any;

      const openai = new OpenAIAdapter();
      await expect(
        openai.executePrompt('Test', { provider: 'openai', model: 'gpt-4o', temperature: 0.7, endpointUrl: LOCAL_OPENAI })
      ).rejects.toThrow('OpenAI execution failed: OpenAI API returned HTTP 403: Forbidden');
    });

    it('handles HTTP status error when response.text() itself throws an error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Error',
        text: async () => {
          throw new Error('Stream read failed');
        },
      }) as any;

      const openai = new OpenAIAdapter();
      await expect(
        openai.executePrompt('Test', { provider: 'openai', model: 'gpt-4o', temperature: 0.7, endpointUrl: LOCAL_OPENAI })
      ).rejects.toThrow('OpenAI execution failed: OpenAI API returned HTTP 500: Internal Error');
    });

    it('handles HTTP 200 OK with non-JSON response bodies (HTML proxy errors, plain text, invalid JSON)', async () => {
      // HTTP 200 returning HTML string (e.g. proxy login page)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      }) as any;

      const ollama = new OllamaAdapter();
      await expect(
        ollama.executePrompt('Test', { provider: 'ollama', model: 'llama3', temperature: 0.7 })
      ).rejects.toThrow(
        'Ollama execution failed: Unexpected token < in JSON at position 0'
      );

      const openai = new OpenAIAdapter();
      await expect(
        openai.executePrompt('Test', { provider: 'openai', model: 'gpt-3.5-turbo', temperature: 0.7, endpointUrl: LOCAL_OPENAI })
      ).rejects.toThrow(
        'OpenAI execution failed: Unexpected token < in JSON at position 0'
      );
    });

    it('handles HTTP 200 OK with missing or null response choices/response properties gracefully', async () => {
      // Ollama returns JSON missing 'response' property
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ model: 'llama3', done: true }),
      }) as any;

      // A reply with no text used to count as a successful empty answer. It is now an error,
      // so a broken provider cannot pass for a model that said nothing.
      const ollama = new OllamaAdapter();
      await expect(ollama.executePrompt('Test', { provider: 'ollama', model: 'llama3', temperature: 0.7 })).rejects.toThrow(
        'Ollama execution failed: Ollama reply had no response text'
      );

      // OpenAI returns empty choices array
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [] }),
      }) as any;

      const openai = new OpenAIAdapter();
      await expect(openai.executePrompt('Test', { provider: 'openai', model: 'gpt-3.5-turbo', temperature: 0.7, endpointUrl: LOCAL_OPENAI })).rejects.toThrow(
        'OpenAI execution failed: OpenAI API reply had no message content'
      );

      // OpenAI returns null choices or missing message content
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: null } }] }),
      }) as any;

      await expect(openai.executePrompt('Test', { provider: 'openai', model: 'gpt-3.5-turbo', temperature: 0.7, endpointUrl: LOCAL_OPENAI })).rejects.toThrow(
        'OpenAI execution failed: OpenAI API reply had no message content'
      );
    });
  });

  // =========================================================================
  // SECTION 5: Memory & Resource Leak Safety Stress Test
  // =========================================================================
  describe('5. Memory/Leak Safety Stress Test (1,000 Rapid Executions)', () => {
    it('executes 1,000 rapid mock executions without memory leak or unhandled rejections', async () => {
      const adapter = defaultModelAdapter;
      const iterations = 1000;

      // Force GC before starting if exposed (e.g. node --expose-gc)
      if ((globalThis as any).gc) {
        (globalThis as any).gc();
      }

      const getHeap = () => ((globalThis as any).process?.memoryUsage ? (globalThis as any).process.memoryUsage().heapUsed : 0);
      const initialHeap = getHeap();
      const startTime = Date.now();

      // Execute 1,000 executions in batches of 100 to avoid stack overflow while stress-testing
      for (let batch = 0; batch < iterations / 100; batch++) {
        const batchPromises = Array.from({ length: 100 }, (_, i) =>
          adapter.executePrompt(`Rapid prompt ${batch * 100 + i}`, {
            provider: 'mock',
            model: 'stress-model',
            mockLatencyMs: 0,
            mockPattern: i % 2 === 0 ? 'echo' : 'template',
            temperature: 0.7,
          })
        );
        const results = await Promise.all(batchPromises);
        expect(results).toHaveLength(100);
      }

      const elapsed = Date.now() - startTime;

      if ((globalThis as any).gc) {
        (globalThis as any).gc();
      }

      const finalHeap = getHeap();
      const heapGrowthBytes = finalHeap - initialHeap;
      const heapGrowthMB = heapGrowthBytes / (1024 * 1024);

      // Log empirical stats
      console.log(
        `[Stress Test Stats] 1,000 rapid executions completed in ${elapsed}ms. Initial Heap: ${(
          initialHeap /
          (1024 * 1024)
        ).toFixed(2)} MB, Final Heap: ${(finalHeap / (1024 * 1024)).toFixed(
          2
        )} MB, Delta: ${heapGrowthMB.toFixed(2)} MB.`
      );

      // Verify overall execution duration is fast (< 3000ms for 1,000 sync-delayed executions)
      expect(elapsed).toBeLessThan(3000);

      // Heap growth for 1,000 calls in memory should be small (< 10 MB threshold)
      expect(heapGrowthMB).toBeLessThan(10);
    });
  });
});
