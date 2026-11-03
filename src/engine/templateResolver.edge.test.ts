import { describe, it, expect } from 'vitest';
import { resolveTemplate, resolveTemplateDetailed } from './templateResolver';

describe('templateResolver stress and edge cases', () => {
  describe('1. Nested & Unclosed Brackets', () => {
    it('handles simple unclosed brackets gracefully', () => {
      const context = { input: 'hello' };
      expect(resolveTemplate('{{input', context)).toBe('{{input');
      expect(resolveTemplate('Prefix {{input suffix', context)).toBe('Prefix {{input suffix');
      expect(resolveTemplate('{{', context)).toBe('{{');
      expect(resolveTemplate('{{{', context)).toBe('{{{');
    });

    it('keeps an unclosed {{ as written instead of swallowing the text and tag after it', () => {
      const context = { input: 'hello' };
      // The old pattern matched from the first unclosed {{ to the next }}, so this returned
      // 'Prefix ' and the medication line vanished from the prompt without any sign.
      expect(resolveTemplate('Prefix {{input and {{input}}', context)).toBe('Prefix {{input and hello');
      expect(resolveTemplateDetailed('Prefix {{input and {{input}}', context).unresolved).toEqual([]);
    });

    it('resolves the inner tag of nested double curly braces {{ {{input}} }} and keeps the outer braces', () => {
      const context = { input: 'inner_value', '{{input': 'nested_key' };
      // A key cannot contain a brace, so the outer pair is plain text.
      expect(resolveTemplate('{{ {{input}} }}', context)).toBe('{{ inner_value }}');
    });

    it('keeps the value of a triple curly brace {{{input}}} instead of deleting it', () => {
      const context = { input: 'raw_html' };
      // The old pattern read the key as "{input", found nothing, and returned '}'.
      expect(resolveTemplate('{{{input}}}', context)).toBe('{raw_html}');
    });

    it('reports placeholders that had no value, in order', () => {
      const detailed = resolveTemplateDetailed('Line: {{inptu}} and {{input}} and {{ }} and {{missing}}', { input: 'x' });
      expect(detailed.text).toBe('Line:  and x and  and ');
      expect(detailed.unresolved).toEqual(['inptu', '', 'missing']);
    });

    it('handles extra property access syntax like {{step1.output.extra}}', () => {
      const context = {
        'step1.output': 'base_output',
        'step1.output.extra': 'nested_prop',
      };
      // Direct exact match works
      expect(resolveTemplate('{{step1.output.extra}}', context)).toBe('nested_prop');
      // Non-existent nested property returns empty string
      expect(resolveTemplate('{{step1.output.missing}}', context)).toBe('');
    });

    it('handles dynamic/nested step expressions {{step[step1.output].output}}', () => {
      const context = {
        'step1.output': 'id123',
        'step[step1.output].output': 'literal_match',
      };
      expect(resolveTemplate('{{step[step1.output].output}}', context)).toBe('literal_match');
    });
  });

  describe('2. Regex Replacement Injection Strings ($1, $2, $&, $\', $`, $$)', () => {
    it('preserves regex replacement tokens in context values literally', () => {
      const context = {
        var1: 'Price is $100 and $200 ($1, $2, $9)',
        var2: 'Matched string: $&',
        var3: 'Following string: $\'',
        var4: 'Preceding string: $`',
        var5: 'Double dollar: $$',
      };

      const template = 'v1: {{var1}} | v2: {{var2}} | v3: {{var3}} | v4: {{var4}} | v5: {{var5}}';
      const result = resolveTemplate(template, context);

      expect(result).toBe(
        'v1: Price is $100 and $200 ($1, $2, $9) | v2: Matched string: $& | v3: Following string: $\' | v4: Preceding string: $` | v5: Double dollar: $$'
      );
    });

    it('preserves regex replacement tokens in template text surrounding variables', () => {
      const context = { input: 'apple' };
      const template = 'Cost $10 for $& {{input}} (pre: $`, post: $\', esc: $$)';
      const result = resolveTemplate(template, context);
      expect(result).toBe('Cost $10 for $& apple (pre: $`, post: $\', esc: $$)');
    });

    it('handles keys with dollar signs if present in context', () => {
      const context = { '$1': 'dollar_one_val' };
      expect(resolveTemplate('{{$1}}', context)).toBe('dollar_one_val');
    });
  });

  describe('3. Large Template Strings & Thousands of Variable Substitutions', () => {
    it('resolves a >100KB template with 1,000 variable substitutions correctly', () => {
      const context: Record<string, string> = {};
      const parts: string[] = [];
      const filler = 'X'.repeat(80); // Ensure size > 100KB

      for (let i = 0; i < 1000; i++) {
        context[`var_${i}`] = `value_${i}`;
        parts.push(`Section ${i}: {{var_${i}}}. ${filler} `);
      }

      const template = parts.join('');
      expect(template.length).toBeGreaterThan(100000); // > 100KB

      const start = performance.now();
      const resolved = resolveTemplate(template, context);
      const durationMs = performance.now() - start;

      expect(resolved).toContain('Section 0: value_0.');
      expect(resolved).toContain('Section 999: value_999.');
      expect(resolved).not.toContain('{{var_');
      console.log(`100KB (${template.length} chars) / 1,000 vars resolution time: ${durationMs.toFixed(3)}ms`);
      expect(durationMs).toBeLessThan(150);
    });

    it('resolves a >500KB template with 5,000 variable substitutions correctly', () => {
      const context: Record<string, string> = {};
      const parts: string[] = [];
      const filler = 'Y'.repeat(80); // Ensure size > 500KB

      for (let i = 0; i < 5000; i++) {
        context[`step${i}.output`] = `output_data_${i}`;
        parts.push(`[Step ${i}]: {{step${i}.output}} ${filler} | `);
      }

      const template = parts.join('');
      expect(template.length).toBeGreaterThan(500000); // > 500KB

      const start = performance.now();
      const resolved = resolveTemplate(template, context);
      const durationMs = performance.now() - start;

      expect(resolved).toContain('[Step 0]: output_data_0');
      expect(resolved).toContain('[Step 4999]: output_data_4999');
      console.log(`500KB (${template.length} chars) / 5,000 vars resolution time: ${durationMs.toFixed(3)}ms`);
      expect(durationMs).toBeLessThan(200);
    });

    it('handles 10,000 missing variable lookups efficiently', () => {
      const context = { existing: 'found' };
      const parts: string[] = [];
      for (let i = 0; i < 10000; i++) {
        parts.push(`Missing: {{missing_${i}}}`);
      }
      const template = parts.join(' ');

      const start = performance.now();
      const resolved = resolveTemplate(template, context);
      const durationMs = performance.now() - start;

      console.log(`10,000 missing vars lookup time: ${durationMs.toFixed(3)}ms`);
      expect(resolved).not.toContain('missing_');
      expect(durationMs).toBeLessThan(200);
    });

    it('handles large context dictionaries (50,000 keys) without degradation', () => {
      const context: Record<string, string> = {};
      for (let i = 0; i < 50000; i++) {
        context[`key_${i}`] = `val_${i}`;
      }
      context['target'] = 'HIT';

      const template = 'Target value is {{target}} among 50,000 keys.';
      const start = performance.now();
      const resolved = resolveTemplate(template, context);
      const durationMs = performance.now() - start;

      expect(resolved).toBe('Target value is HIT among 50,000 keys.');
      console.log(`50,000 context keys lookup time: ${durationMs.toFixed(3)}ms`);
      expect(durationMs).toBeLessThan(50);
    });
  });

  describe('4. Whitespace Extremes & Multiline Formatting', () => {
    it('trims tabs, spaces, and newline padding inside placeholders', () => {
      const context = {
        'step1.output': 'tab_val',
        'step2.output': 'newline_val',
      };
      const template = 'Tab: {{\t step1.output \t}} | Newline: {{\n step2.output \n}}';
      expect(resolveTemplate(template, context)).toBe('Tab: tab_val | Newline: newline_val');
    });

    it('demonstrates failure to match tag when newline is inside key string itself', () => {
      const context = { 'step1.output': 'val' };
      // Dot in regex /\{\{\s*(.*?)\s*\}\}/g does NOT match newline characters without /s flag
      const template = '{{\nstep1.\noutput\n}}';
      const resolved = resolveTemplate(template, context);
      // Fails to match regex, returns untouched string
      expect(resolved).toBe('{{\nstep1.\noutput\n}}');
    });

    it('handles multiline template strings with interspersed placeholders', () => {
      const context = {
        title: 'System Analysis',
        'step1.output': 'First analysis step.\nWith multiple lines.',
        author: 'Alice',
      };

      const template = `
# {{title}}
Author: {{author}}

## Section 1
{{step1.output}}

## Section 2
Finished.
`;

      const expected = `
# System Analysis
Author: Alice

## Section 1
First analysis step.
With multiple lines.

## Section 2
Finished.
`;

      expect(resolveTemplate(template, context)).toBe(expected);
    });

    it('handles non-standard whitespace (non-breaking space \u00A0)', () => {
      const context = { 'nbs_key': 'nbs_value' };
      const template = '{{ \u00A0nbs_key\u00A0 }}';
      expect(resolveTemplate(template, context)).toBe('nbs_value');
    });
  });

  describe('5. Benchmark Throughput (Sub-millisecond Resolution Target)', () => {
    it('achieves sub-millisecond per-resolution latency over 1,000 typical iterations', () => {
      const context = {
        input: 'Analyze quantum algorithms',
        'step1.output': 'Quantum Fourier Transform breakdown',
        'step2.output': 'Shor algorithm complexity bounds',
        user: 'Research Team',
      };

      const template = 'User: {{user}}\nInput: {{input}}\nStep 1: {{step1.output}}\nStep 2: {{step2.output}}\nSummary: {{step1}} & {{step2}}';

      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        resolveTemplate(template, context);
      }
      const totalDuration = performance.now() - start;
      const avgDuration = totalDuration / iterations;

      console.log(`Average throughput over ${iterations} runs: ${avgDuration.toFixed(5)} ms per resolution (Total: ${totalDuration.toFixed(2)} ms)`);
      expect(avgDuration).toBeLessThan(1.0); // Sub-millisecond target (target < 1.0 ms, achieved ~0.002 ms)
    });
  });

  describe('6. Security & Prototype Pollution Vulnerability Checks', () => {
    it('safely handles built-in prototype property names in template tags', () => {
      const context = { input: 'normal' };
      expect(resolveTemplate('{{toString}}', context)).toBe('');
      expect(resolveTemplate('{{valueOf}}', context)).toBe('');
      expect(resolveTemplate('{{__proto__}}', context)).toBe('');
      expect(resolveTemplate('{{constructor}}', context)).toBe('');
      expect(resolveTemplate('{{hasOwnProperty}}', context)).toBe('');
    });

    it('does not leak inherited prototype properties if present on object prototype', () => {
      const context = Object.create({ inheritedProp: 'LEAKED' });
      context.input = 'safe';
      expect(resolveTemplate('{{inheritedProp}}', context)).toBe('');
      expect(resolveTemplate('{{input}}', context)).toBe('safe');
    });

    it('prevents indirect recursive prompt injection (single-pass substitution)', () => {
      const context = {
        input: '{{secret_key}}',
        secret_key: 'SUPER_SECRET_PASSWORD',
      };
      const template = 'User prompt: {{input}}';
      const resolved = resolveTemplate(template, context);
      // Single pass resolution prevents recursive evaluation of injected templates
      expect(resolved).toBe('User prompt: {{secret_key}}');
    });

    /**
     * The bound is deliberately far above the real runtime (these resolve in
     * well under a millisecond) because of what it has to discriminate.
     *
     * Catastrophic backtracking is not "slower" — it is exponential in the
     * input, so the pathological cases below would take seconds, minutes, or
     * never finish. Any bound between "sub-millisecond" and "seconds" catches
     * that equally well, and every one of them is measuring the same thing.
     *
     * What differs is what else the bound catches. At 50ms it also caught the
     * machine: `performance.now()` spans wall-clock, so under a parallel vitest
     * run a sub-millisecond call exceeds 50ms on scheduling alone. It failed
     * roughly one full-suite run in four while passing in isolation — a verdict
     * about load, not about the regex. A generous bound keeps all of the ReDoS
     * signal and none of that. If the resolver ever does hang, vitest's own
     * 5s test timeout is the backstop.
     */
    const REDOS_BUDGET_MS = 1000;

    it('resists catastrophic regex backtracking (ReDoS) on pathological brace sequences', () => {
      const pathologicalTemplate = '{{' + 'a'.repeat(500) + ' text without closing brace';
      const start = performance.now();
      const resolved = resolveTemplate(pathologicalTemplate, { input: 'test' });
      const durationMs = performance.now() - start;

      expect(resolved).toBe(pathologicalTemplate);
      expect(durationMs).toBeLessThan(REDOS_BUDGET_MS);
    });

    it('resists catastrophic regex backtracking on massive unclosed nested opening braces', () => {
      const pathologicalTemplate = '{{'.repeat(1000) + 'input';
      const start = performance.now();
      const resolved = resolveTemplate(pathologicalTemplate, { input: 'test' });
      const durationMs = performance.now() - start;

      expect(resolved).toBe(pathologicalTemplate);
      expect(durationMs).toBeLessThan(REDOS_BUDGET_MS);
    });
  });
});
