import { describe, it, expect } from 'vitest';
import { MockEndpoint, executeMockPrompt } from './mockEndpoint';
import { ModelConfig } from '../types/flow';

describe('MockEndpoint', () => {
  const baseConfig: ModelConfig = {
    provider: 'mock',
    model: 'mock-default',
    temperature: 0.7,
    mockLatencyMs: 20,
  };

  describe('Response Patterns', () => {
    it('generates response with default echo pattern', async () => {
      const endpoint = new MockEndpoint();
      const prompt = 'Hello world LLM';
      const result = await endpoint.generateResponse(prompt, {
        ...baseConfig,
        mockPattern: 'echo',
      });

      expect(result.text).toBe('[Mock Echo] Hello world LLM');
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(15);
    });

    it('generates response with template pattern summarizing metadata', async () => {
      const endpoint = new MockEndpoint();
      const prompt = 'Summarize quantum mechanics concepts in three key bullet points.';
      const result = await endpoint.generateResponse(prompt, {
        ...baseConfig,
        mockPattern: 'template',
        model: 'gpt-4o-mock',
        temperature: 0.2,
      });

      expect(result.text).toContain('[Mock Output] Model: gpt-4o-mock, Temp: 0.2');
      expect(result.text).toContain(`Length: ${prompt.length} chars`);
      expect(result.text).toContain('Summarize quantum mechanics concepts in three key ...');
    });

    it('generates response with custom pattern', async () => {
      const endpoint = new MockEndpoint();
      const customOutput = 'This is a custom predefined LLM output string.';
      const result = await endpoint.generateResponse('Test prompt', {
        ...baseConfig,
        mockPattern: 'custom',
        mockCustomResponse: customOutput,
      });

      expect(result.text).toBe(customOutput);
    });

    it('falls back to default text when custom pattern is chosen but mockCustomResponse is omitted', async () => {
      const endpoint = new MockEndpoint();
      const result = await endpoint.generateResponse('Test prompt', {
        ...baseConfig,
        mockPattern: 'custom',
      });

      expect(result.text).toBe('[Mock Custom Output]');
    });
  });

  describe('Latency Simulation', () => {
    it('simulates specified artificial latency delay accurately', async () => {
      const endpoint = new MockEndpoint();
      const targetLatency = 60;
      const startTime = Date.now();

      const result = await endpoint.generateResponse('Speed test', {
        ...baseConfig,
        mockLatencyMs: targetLatency,
      });

      const actualDuration = Date.now() - startTime;
      expect(result.latencyMs).toBeGreaterThanOrEqual(50);
      expect(actualDuration).toBeGreaterThanOrEqual(50);
    });

    it('handles zero latency configuration smoothly', async () => {
      const endpoint = new MockEndpoint();
      const result = await endpoint.generateResponse('Fast test', {
        ...baseConfig,
        mockLatencyMs: 0,
      });

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.text).toBe('[Mock Echo] Fast test');
    });
  });

  describe('Error Triggers', () => {
    it('throws simulated error when config.model is mock-error', async () => {
      const endpoint = new MockEndpoint();
      const config: ModelConfig = {
        ...baseConfig,
        model: 'mock-error',
      };

      await expect(endpoint.generateResponse('Test prompt', config)).rejects.toThrow(
        "Simulated mock endpoint error for model 'mock-error'"
      );
    });

    it('throws simulated error when prompt contains [SIMULATE_ERROR]', async () => {
      const endpoint = new MockEndpoint();
      const prompt = 'Please process this prompt [SIMULATE_ERROR] now.';

      await expect(endpoint.generateResponse(prompt, baseConfig)).rejects.toThrow(
        "Simulated mock endpoint error for model 'mock-default'"
      );
    });
  });

  describe('executeMockPrompt Function Helper', () => {
    it('executes mock prompt via helper function correctly', async () => {
      const result = await executeMockPrompt('Helper test prompt', {
        ...baseConfig,
        mockPattern: 'echo',
      });

      expect(result.text).toBe('[Mock Echo] Helper test prompt');
      expect(result.latencyMs).toBeGreaterThanOrEqual(10);
    });
  });
});
