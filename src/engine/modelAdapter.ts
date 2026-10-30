import { ModelConfig, ModelExecutionResult, ModelEndpointAdapter } from '../types/flow';
import { executeMockPrompt } from './mockEndpoint';

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
 */
export class OllamaAdapter implements ModelEndpointAdapter {
  async executePrompt(prompt: string, config: ModelConfig): Promise<ModelExecutionResult> {
    const startTime = performance.now();
    const endpointUrl = config.endpointUrl || 'http://localhost:11434/api/generate';

    const payload: Record<string, unknown> = {
      model: config.model || 'llama3',
      prompt,
      stream: false,
      options: {
        temperature: config.temperature ?? 0.7,
      },
    };
    if (config.format !== undefined) {
      payload.format = config.format;
    }
    if (config.think !== undefined) {
      payload.think = config.think;
    }

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const elapsed = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `Ollama endpoint returned HTTP ${response.status}: ${errorText || response.statusText || 'Request failed'}`
        );
      }

      const data = await response.json();
      const textOutput = data.response ?? '';

      return {
        text: textOutput,
        latencyMs: elapsed,
      };
    } catch (err: unknown) {
      const errorMessage = (err as Error)?.message || String(err);
      throw new Error(`Ollama execution failed: ${errorMessage}`);
    }
  }
}

/**
 * Adapter for OpenAI-compatible REST API endpoints.
 * Connects to OpenAI or custom OpenAI-compatible server (default: https://api.openai.com/v1/chat/completions).
 */
export class OpenAIAdapter implements ModelEndpointAdapter {
  async executePrompt(prompt: string, config: ModelConfig): Promise<ModelExecutionResult> {
    const startTime = performance.now();
    const endpointUrl = config.endpointUrl || 'https://api.openai.com/v1/chat/completions';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (config.systemPrompt) {
      messages.push({ role: 'system', content: config.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const payload: Record<string, unknown> = {
      model: config.model || 'gpt-3.5-turbo',
      messages,
      temperature: config.temperature ?? 0.7,
    };

    if (config.maxTokens) {
      payload.max_tokens = config.maxTokens;
    }

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const elapsed = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(
          `OpenAI API returned HTTP ${response.status}: ${errorBody || response.statusText || 'Request failed'}`
        );
      }

      const data = await response.json();
      const textOutput = data.choices?.[0]?.message?.content ?? '';

      return {
        text: textOutput,
        latencyMs: elapsed,
      };
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
