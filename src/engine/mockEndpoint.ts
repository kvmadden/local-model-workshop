import { ModelConfig, ModelExecutionResult } from '../types/flow';

/**
 * Mock LLM Endpoint implementation for offline prototyping and test suites.
 *
 * Provides deterministic response generation, latency simulation, pattern matching,
 * and controllable error triggers.
 */
export class MockEndpoint {
  /**
   * Generates a deterministic mock response based on the provided prompt and config.
   *
   * @param prompt - The input prompt text.
   * @param config - Model execution configuration.
   * @returns ModelExecutionResult containing text, latencyMs, and optional error.
   */
  async generateResponse(prompt: string, config: ModelConfig): Promise<ModelExecutionResult> {
    const startTime = performance.now();

    // 1. Simulate artificial execution delay
    const latencyTarget = config.mockLatencyMs ?? 150;
    if (latencyTarget > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyTarget));
    }

    const elapsed = Math.round(performance.now() - startTime);

    // 2. Simulated Error Triggers
    if (
      config.model === 'mock-error' ||
      (prompt && prompt.includes('[SIMULATE_ERROR]')) ||
      config.mockPattern === ('error' as any)
    ) {
      throw new Error(`Simulated mock endpoint error for model '${config.model}'`);
    }

    // 3. Response Pattern Logic
    const pattern = config.mockPattern || 'echo';
    let textOutput = '';

    switch (pattern) {
      case 'custom':
        textOutput = config.mockCustomResponse ?? '[Mock Custom Output]';
        break;

      case 'template': {
        const preview = prompt.length > 50 ? `${prompt.slice(0, 50)}...` : prompt;
        textOutput = `[Mock Output] Model: ${config.model}, Temp: ${config.temperature ?? 0.7}, Length: ${prompt.length} chars. Response to: ${preview}`;
        break;
      }

      case 'echo':
      default:
        textOutput = `[Mock Echo] ${prompt}`;
        break;
    }

    return {
      text: textOutput,
      latencyMs: elapsed,
    };
  }
}

/**
 * Functional convenience wrapper for MockEndpoint.
 */
export async function executeMockPrompt(
  prompt: string,
  config: ModelConfig
): Promise<ModelExecutionResult> {
  const endpoint = new MockEndpoint();
  return endpoint.generateResponse(prompt, config);
}
