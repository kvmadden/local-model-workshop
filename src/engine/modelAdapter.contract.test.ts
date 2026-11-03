/**
 * The adapter contract the eval and the app rely on: deadlines, whole-body timing, honest
 * failures, settings that reach the provider, and no prompt text leaving this machine by default.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { OllamaAdapter, OpenAIAdapter, isLoopbackUrl } from './modelAdapter';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.useRealTimers();
});

const capture = (reply: unknown) => {
  const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
  globalThis.fetch = vi.fn(async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as any;
  return calls;
};

describe('adapter contract', () => {
  it('knows which endpoints are on this machine', () => {
    for (const url of ['http://localhost:11434/api/generate', 'http://127.0.0.1:1234/v1', 'http://[::1]:8080']) expect(isLoopbackUrl(url), url).toBe(true);
    for (const url of ['https://api.openai.com/v1/chat/completions', 'http://192.168.1.100:11434', 'http://10.0.0.5', 'not a url']) expect(isLoopbackUrl(url), url).toBe(false);
  });

  // Review round 2 (3 Nov), Grok 9. The URL parser decides what an address is before the check runs.
  it('trusts localhost and loopback addresses only, never a name that merely ends in .localhost', () => {
    // Names under .localhost reach this machine only if the resolver implements that special case.
    for (const url of ['http://app.localhost:3000', 'http://evil.localhost:11434/api/generate', 'http://localtest.me:11434', 'http://0.0.0.0:11434']) expect(isLoopbackUrl(url), url).toBe(false);
    // Not a valid address at all, so the URL parser rejects it and nothing is sent.
    expect(isLoopbackUrl('http://127.0.0.256/api/generate')).toBe(false);
    // These are loopback: the URL parser rewrites each of them to 127.0.0.1 before the check.
    for (const url of ['http://127.0.0.01/api/generate', 'http://127.1:11434', 'http://2130706433:11434']) expect(isLoopbackUrl(url), url).toBe(true);
    // IPv4-mapped loopback is this machine too.
    expect(isLoopbackUrl('http://[::ffff:127.0.0.1]:11434')).toBe(true);
    expect(isLoopbackUrl('http://[::ffff:10.0.0.5]:11434')).toBe(false);
  });

  it('asks fetch to fail on a redirect instead of following it (GPT 2, Grok 8)', async () => {
    const inits: RequestInit[] = [];
    globalThis.fetch = vi.fn(async (_url: string, init: RequestInit) => {
      inits.push(init);
      return new Response(JSON.stringify({ response: 'ok', choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    }) as any;
    await new OllamaAdapter().executePrompt('p', { provider: 'ollama', model: 'm' });
    await new OpenAIAdapter().executePrompt('p', { provider: 'openai', model: 'm', endpointUrl: 'http://127.0.0.1:1234/v1/chat/completions' });
    expect(inits.map((i) => i.redirect)).toEqual(['error', 'error']);
  });

  it('refuses to send prompt text off the machine unless explicitly allowed, and sends nothing', async () => {
    const calls = capture({ choices: [{ message: { content: 'x' } }] });
    await expect(new OpenAIAdapter().executePrompt('secret text', { provider: 'openai', model: 'gpt-4o' })).rejects.toThrow(/refusing to send this prompt to api.openai.com/);
    await expect(new OpenAIAdapter().executePrompt('secret text', { provider: 'openai', model: 'gpt-4o', allowRemote: true })).rejects.toThrow(/API key/);
    await expect(new OpenAIAdapter().executePrompt('secret text', { provider: 'openai', model: 'gpt-4o', apiKey: 'k' })).rejects.toThrow(/allowRemote/);
    expect(calls).toHaveLength(0);
    await new OpenAIAdapter().executePrompt('secret text', { provider: 'openai', model: 'gpt-4o', apiKey: 'k', allowRemote: true });
    expect(calls).toHaveLength(1);
  });

  it('times out a request that never answers', async () => {
    globalThis.fetch = vi.fn(() => new Promise(() => undefined)) as any;
    await expect(new OllamaAdapter().executePrompt('p', { provider: 'ollama', model: 'm', timeoutMs: 50 })).rejects.toThrow('Ollama execution failed: timed out after 50 ms');
  });

  it('times the whole exchange, including a slow body', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: () => new Promise((r) => setTimeout(() => r({ response: '{}' }), 120)), text: async () => '' })) as any;
    const result = await new OllamaAdapter().executePrompt('p', { provider: 'ollama', model: 'm' });
    expect(result.latencyMs).toBeGreaterThanOrEqual(100);
  });

  it('treats an error body or a non-string reply as a failure, not an empty answer', async () => {
    capture({ error: 'model failed to load' });
    await expect(new OllamaAdapter().executePrompt('p', { provider: 'ollama', model: 'm' })).rejects.toThrow('Ollama returned an error: model failed to load');
    capture({ response: 123 });
    await expect(new OllamaAdapter().executePrompt('p', { provider: 'ollama', model: 'm' })).rejects.toThrow('Ollama reply had no response text');
    capture({ error: { message: 'quota' } });
    await expect(new OpenAIAdapter().executePrompt('p', { provider: 'openai', model: 'm', endpointUrl: 'http://127.0.0.1:1234/v1/chat/completions' })).rejects.toThrow('OpenAI API returned an error: quota');
  });

  it('sends the settings it is given: system prompt, seed, token limit, context window, format', async () => {
    const calls = capture({ response: 'ok', eval_count: 12, eval_duration: 3000000, total_duration: 9000000, load_duration: 1000, prompt_eval_count: 40 });
    const result = await new OllamaAdapter().executePrompt('p', { provider: 'ollama', model: 'm', systemPrompt: 'SYSTEM', seed: 7, maxTokens: 64, numCtx: 4096, temperature: 0, format: 'json', think: false });
    expect(calls[0].body).toEqual({ model: 'm', prompt: 'p', stream: false, system: 'SYSTEM', format: 'json', think: false, options: { temperature: 0, seed: 7, num_predict: 64, num_ctx: 4096 } });
    expect(result.meta).toEqual({ eval_count: 12, eval_duration: 3000000, total_duration: 9000000, load_duration: 1000, prompt_eval_count: 40 });
  });

  it('passes a JSON schema to OpenAI-compatible servers instead of dropping it', async () => {
    const calls = capture({ choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } });
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    const result = await new OpenAIAdapter().executePrompt('p', { provider: 'openai', model: 'm', endpointUrl: 'http://127.0.0.1:1234/v1/chat/completions', format: schema, seed: 1 });
    expect(calls[0].body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'response', schema, strict: true } });
    expect(calls[0].body.seed).toBe(1);
    expect(result.meta).toEqual({ prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 });
  });

  it('keeps long provider error bodies out of error messages', async () => {
    globalThis.fetch = vi.fn(async () => new Response('x'.repeat(5000), { status: 500 })) as any;
    const err = await new OllamaAdapter().executePrompt('p', { provider: 'ollama', model: 'm' }).catch((e: Error) => e.message);
    expect(String(err).length).toBeLessThan(400);
  });
});
