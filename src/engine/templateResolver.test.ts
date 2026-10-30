import { describe, it, expect } from 'vitest';
import { resolveTemplate } from './templateResolver';

describe('templateResolver', () => {
  describe('Basic Variable Resolution', () => {
    it('resolves {{input}} from context', () => {
      const context = { input: 'User query about quantum computing' };
      const template = 'Summarize the following topic: {{input}}';
      expect(resolveTemplate(template, context)).toBe('Summarize the following topic: User query about quantum computing');
    });

    it('resolves {{initialInput}} alias if {{input}} is not explicitly present', () => {
      const context = { initialInput: 'Initial system prompt' };
      const template = 'Input was: {{input}}';
      expect(resolveTemplate(template, context)).toBe('Input was: Initial system prompt');
    });

    it('resolves custom context variables directly', () => {
      const context = { system_role: 'expert accountant', user_name: 'Alice' };
      const template = 'You are an {{system_role}} assisting {{user_name}}.';
      expect(resolveTemplate(template, context)).toBe('You are an expert accountant assisting Alice.');
    });
  });

  describe('Step Output Referencing', () => {
    it('resolves 1-based indexed step outputs ({{step1.output}}, {{step2.output}})', () => {
      const context = {
        input: 'Raw input text',
        'step1.output': 'Outline of paper',
        'step2.output': 'First draft of paper',
      };
      const template = 'Based on {{step1.output}} and {{step2.output}}, create a final summary.';
      expect(resolveTemplate(template, context)).toBe('Based on Outline of paper and First draft of paper, create a final summary.');
    });

    it('resolves step ID bracket notation ({{step[step-id-123].output}})', () => {
      const context = {
        'step-id-123.output': 'Output from step 123',
      };
      const template = 'Result: {{step[step-id-123].output}}';
      expect(resolveTemplate(template, context)).toBe('Result: Output from step 123');
    });

    it('resolves step index bracket notation ({{step[1].output}})', () => {
      const context = {
        'step1.output': 'Output from step index 1',
      };
      const template = 'Step 1 output: {{step[1].output}}';
      expect(resolveTemplate(template, context)).toBe('Step 1 output: Output from step index 1');
    });

    it('resolves named step outputs ({{step_summarizer.output}})', () => {
      const context = {
        'summarizer.output': 'Summarized points',
      };
      const template = 'Review: {{step_summarizer.output}}';
      expect(resolveTemplate(template, context)).toBe('Review: Summarized points');
    });

    it('resolves shorthand step reference without .output ({{step1}})', () => {
      const context = {
        'step1.output': 'Shorthand content',
      };
      const template = 'Content: {{step1}}';
      expect(resolveTemplate(template, context)).toBe('Content: Shorthand content');
    });
  });

  describe('Whitespace Handling', () => {
    it('trims whitespace inside double curly braces', () => {
      const context = { input: 'clean input', 'step1.output': 'clean output' };
      const template = 'Input: {{ input }} | Output: {{   step1.output\t}}';
      expect(resolveTemplate(template, context)).toBe('Input: clean input | Output: clean output');
    });
  });

  describe('Missing Variables & Fallbacks', () => {
    it('resolves missing variables to empty string', () => {
      const context = { input: 'hello' };
      const template = 'Input: {{input}}, Step 1: {{step1.output}}, Missing: {{missing_var}}';
      expect(resolveTemplate(template, context)).toBe('Input: hello, Step 1: , Missing: ');
    });

    it('handles empty context dictionary gracefully', () => {
      const template = 'Input: {{input}}';
      expect(resolveTemplate(template, {})).toBe('Input: ');
    });

    it('handles omitted context argument', () => {
      const template = 'Input: {{input}}';
      expect(resolveTemplate(template)).toBe('Input: ');
    });

    it('resolves empty braces {{}} to empty string', () => {
      const template = 'Empty tag: {{}}';
      expect(resolveTemplate(template)).toBe('Empty tag: ');
    });
  });

  describe('Edge Cases & Security', () => {
    it('returns empty string for null, undefined, or empty prompt template', () => {
      expect(resolveTemplate('')).toBe('');
      expect(resolveTemplate(null)).toBe('');
      expect(resolveTemplate(undefined)).toBe('');
    });

    it('leaves single braces untouched', () => {
      const template = 'Single {brace} remains untouched';
      expect(resolveTemplate(template, { brace: 'replaced' })).toBe('Single {brace} remains untouched');
    });

    it('handles unclosed braces gracefully', () => {
      const template = 'Unclosed {{input brace';
      expect(resolveTemplate(template, { input: 'val' })).toBe('Unclosed {{input brace');
    });

    it('safely handles context values containing dollar sign special characters ($1, $&)', () => {
      const context = { input: 'Total cost: $100 & shipping: $10' };
      const template = 'Price details: {{input}}';
      expect(resolveTemplate(template, context)).toBe('Price details: Total cost: $100 & shipping: $10');
    });

    it('handles multiline output in context correctly', () => {
      const context = { 'step1.output': 'Line 1\nLine 2\nLine 3' };
      const template = 'Multi-line result:\n{{step1.output}}';
      expect(resolveTemplate(template, context)).toBe('Multi-line result:\nLine 1\nLine 2\nLine 3');
    });

    it('handles JSON string values in context', () => {
      const context = { 'step1.output': '{"status": "ok", "items": [1, 2, 3]}' };
      const template = 'JSON Payload: {{step1.output}}';
      expect(resolveTemplate(template, context)).toBe('JSON Payload: {"status": "ok", "items": [1, 2, 3]}');
    });
  });
});
