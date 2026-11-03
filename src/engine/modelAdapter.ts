import { ModelConfig, ModelExecutionResult, ModelEndpointAdapter } from '../types/flow';
import { executeMockPrompt } from './mockEndpoint';

/** Requests are abandoned after this long unless the step sets `timeoutMs`. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** How much of a provider's error body is kept in an error message. */
const MAX_ERROR_TEXT = 300;

const truncate = (text: string) => (text.length > MAX_ERROR_TEXT ? `${text.slice(0, MAX_ERROR_TEXT)}...` : text);

/**
 * True when a URL points at this machine: the name localhost, an address in 127.0.0.0/8, ::1 or
 * IPv4-mapped loopback. The URL parser rewrites every spelling of an IPv4 address (127.1,
 * 2130706433, 127.0.0.01) to dotted decimal and rejects invalid ones (127.0.0.256) before this
 * check runs. Names under .localhost are refused: they reach this machine only if the resolver
 * implements that special case.
 */
export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host) || /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/.test(host);
  } catch {
    return false;
  }
}

/**
 * POSTs JSON and reads the whole reply body before stopping the clock. The deadline covers the
 * connection and the body, and applies even if a fetch implementation ignores the abort signal.
 * Redirects are never followed: a 307 or 308 would send the same prompt to the new location,
 * which the local-only check never saw.
 */
async function postJson(
  label: string,
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ data: Record<string, unknown>; latencyMs: number }> {
  const startTime = performance.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  const exchange = (async () => {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, redirect: 'error' });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`${label} returned HTTP ${response.status}: ${truncate(errorText || response.statusText || 'Request failed')}`);
    }
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${label} reply was not a JSON object`);
    return data as Record<string, unknown>;
  })();
  try {
    const data = await Promise.race([exchange, deadline]);
    return { data, latencyMs: Math.round(performance.now() - startTime) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Throws before anything is sent when the endpoint is not on this machine and the caller has not
 * explicitly allowed it. Prompt text is the data this workshop is meant to keep local.
 */
function refuseRemote(endpointUrl: string, allowed: boolean, how: string): void {
  if (isLoopbackUrl(endpointUrl) || allowed) return;
  let host = endpointUrl;
  try {
    host = new URL(endpointUrl).host;
  } catch {
    // keep the raw value in the message
  }
  throw new Error(`refusing to send this prompt to ${host}, which is not this machine. ${how}`);
}

const requireModel = (label: string, config: ModelConfig) => {
  if (!config.model || !config.model.trim()) throw new Error(`${label}: no model name was given`);
  return config.model.trim();
};

const numbersFrom = (source: unknown, keys: string[]): Record<string, number> | undefined => {
  if (!source || typeof source !== 'object') return undefined;
  const picked: Record<string, number> = {};
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) picked[key] = value;
  }
  return Object.keys(picked).length ? picked : undefined;
};

/**
 * Adapter for Mock model endpoint provider.
 */
export class MockAdapter implements ModelEndpointAdapter {
  async executePrompt(prompt: string, config: ModelConfig): Promise<ModelExecutionResult> {
    return executeMockPrompt(prompt, config);
  }
}

/**
 * Adapter for local Ollama LLM endpoint provider.
 * Connects to Ollama REST API (default: http://localhost:11434/api/generate).
 * An Ollama server on another machine is used only when the step sets `allowRemote: true`.
 */
export class OllamaAdapter implements ModelEndpointAdapter {
  async executePrompt(prompt: string, config: ModelConfig): Promise<ModelExecutionResult> {
    try {
      const model = requireModel('Ollama', config);
      const endpointUrl = config.endpointUrl || 'http://localhost:11434/api/generate';
      refuseRemote(endpointUrl, Boolean(config.allowRemote), 'Set allowRemote to use an Ollama server on another machine.');
      const options: Record<string, unknown> = { temperature: config.temperature ?? 0.7 };
      if (config.seed !== undefined) options.seed = config.seed;
      if (config.maxTokens !== undefined) options.num_predict = config.maxTokens;
      if (config.numCtx !== undefined) options.num_ctx = config.numCtx;

      const payload: Record<string, unknown> = { model, prompt, stream: false, options };
      if (config.systemPrompt) payload.system = config.systemPrompt;
      if (config.format !== undefined) payload.format = config.format;
      if (config.think !== undefined) payload.think = config.think;

      const { data, latencyMs } = await postJson('Ollama endpoint', endpointUrl, payload, { 'Content-Type': 'application/json' }, config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      if (typeof data.error === 'string') throw new Error(`Ollama returned an error: ${truncate(data.error)}`);
      if (typeof data.response !== 'string') throw new Error('Ollama reply had no response text');

      return {
        text: data.response,
        latencyMs,
        meta: numbersFrom(data, ['total_duration', 'load_duration', 'prompt_eval_count', 'prompt_eval_duration', 'eval_count', 'eval_duration']),
      };
    } catch (err: unknown) {
      const errorMessage = (err as Error)?.message || String(err);
      throw new Error(`Ollama execution failed: ${errorMessage}`);
    }
  }
}

/**
 * Adapter for OpenAI-compatible REST API endpoints.
 *
 * The default endpoint is OpenAI's hosted API. Text goes to a host other than this machine only
 * when the step sets both `allowRemote: true` and an API key. Otherwise the request is refused
 * before anything is sent. Local OpenAI-compatible servers (LM Studio, llama.cpp) need neither.
 */
export class OpenAIAdapter implements ModelEndpointAdapter {
  async executePrompt(prompt: string, config: ModelConfig): Promise<ModelExecutionResult> {
    try {
      const model = requireModel('OpenAI-compatible', config);
      const endpointUrl = config.endpointUrl || 'https://api.openai.com/v1/chat/completions';
      refuseRemote(endpointUrl, Boolean(config.allowRemote && config.apiKey), 'Set allowRemote and an API key to use a hosted endpoint.');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

      const messages: Array<{ role: string; content: string }> = [];
      if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt });
      messages.push({ role: 'user', content: prompt });

      const payload: Record<string, unknown> = { model, messages, temperature: config.temperature ?? 0.7 };
      if (config.maxTokens) payload.max_tokens = config.maxTokens;
      if (config.seed !== undefined) payload.seed = config.seed;
      if (config.format === 'json') payload.response_format = { type: 'json_object' };
      else if (config.format && typeof config.format === 'object') {
        payload.response_format = { type: 'json_schema', json_schema: { name: 'response', schema: config.format, strict: true } };
      }

      const { data, latencyMs } = await postJson('OpenAI API', endpointUrl, payload, headers, config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const apiError = data.error as { message?: unknown } | string | undefined;
      if (apiError) throw new Error(`OpenAI API returned an error: ${truncate(typeof apiError === 'string' ? apiError : String(apiError.message ?? 'unknown error'))}`);
      const choices = data.choices as Array<{ message?: { content?: unknown } }> | undefined;
      const content = choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('OpenAI API reply had no message content');

      return { text: content, latencyMs, meta: numbersFrom(data.usage, ['prompt_tokens', 'completion_tokens', 'total_tokens']) };
    } catch (err: unknown) {
      const errorMessage = (err as Error)?.message || String(err);
      throw new Error(`OpenAI execution failed: ${errorMessage}`);
    }
  }
}

/**
 * Unified Model Endpoint Adapter routing prompts based on provider configuration.
 */
export class UnifiedModelAdapter implements ModelEndpointAdapter {
  private mockAdapter = new MockAdapter();
  private ollamaAdapter = new OllamaAdapter();
  private openAIAdapter = new OpenAIAdapter();

  async executePrompt(prompt: string, config: ModelConfig): Promise<ModelExecutionResult> {
    const provider = config.provider || 'mock';

    switch (provider) {
      case 'mock':
        return this.mockAdapter.executePrompt(prompt, config);
      case 'ollama':
        return this.ollamaAdapter.executePrompt(prompt, config);
      case 'openai':
        return this.openAIAdapter.executePrompt(prompt, config);
      default:
        throw new Error(`Unsupported model provider: '${provider}'`);
    }
  }
}

/**
 * Singleton instance of UnifiedModelAdapter for global application execution.
 */
export const defaultModelAdapter = new UnifiedModelAdapter();
