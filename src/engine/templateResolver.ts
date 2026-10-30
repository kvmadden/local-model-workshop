/**
 * Prompt template resolver for the flow engine.
 *
 * Resolves double-curly variable placeholders in prompt templates using values
 * provided in the context dictionary.
 *
 * Supported Placeholder Formats:
 * - {{input}} or {{initialInput}}: Resolves initial flow input.
 * - {{step1.output}}, {{step2.output}}, etc.: Resolves output of step by 1-based index.
 * - {{step[id].output}} or {{step[1].output}}: Resolves step output by step ID or bracket index.
 * - {{step_name.output}} or {{stepName.output}}: Resolves output by step name.
 * - {{step1}} or {{step[id]}}: Shorthand reference without .output.
 * - Arbitrary context keys: e.g. {{custom_var}}.
 */

const PLACEHOLDER_REGEX = /\{\{\s*(.*?)\s*\}\}/g;

/**
 * Resolves prompt templates against a given context dictionary.
 *
 * @param promptTemplate - The template string containing {{variable}} placeholders.
 * @param context - Dictionary mapping variable keys to string outputs.
 * @returns Fully resolved prompt string with variables substituted.
 */
export function resolveTemplate(
  promptTemplate: string | null | undefined,
  context: Record<string, string> = {}
): string {
  if (!promptTemplate) {
    return '';
  }

  return promptTemplate.replace(PLACEHOLDER_REGEX, (_match: string, rawKey: string): string => {
    const key = rawKey.trim();

    if (!key) {
      return '';
    }

    // 1. Direct exact key match in context
    if (Object.prototype.hasOwnProperty.call(context, key) && context[key] !== undefined) {
      return context[key];
    }

    // 2. Input / initialInput alias resolution
    if (key === 'input' || key === 'initialInput') {
      if (context['input'] !== undefined) return context['input'];
      if (context['initialInput'] !== undefined) return context['initialInput'];
    }

    // 3. Bracket notation handling: e.g. {{step[step-id-123].output}} or {{step[1].output}}
    const bracketMatch = key.match(/^step\[([^\]]+)\](?:\.output)?$/i);
    if (bracketMatch) {
      const innerId = bracketMatch[1].trim();
      const candidateKeys = [
        `step[${innerId}].output`,
        `${innerId}.output`,
        `step${innerId}.output`,
        innerId,
      ];
      for (const candidate of candidateKeys) {
        if (Object.prototype.hasOwnProperty.call(context, candidate) && context[candidate] !== undefined) {
          return context[candidate];
        }
      }
    }

    // 4. Indexed or named step output lookups: e.g. {{step1.output}}, {{step_summarize.output}}
    const stepDotMatch = key.match(/^step_?([a-zA-Z0-9_-]+)\.output$/i);
    if (stepDotMatch) {
      const stepIdent = stepDotMatch[1];
      const candidateKeys = [
        `step${stepIdent}.output`,
        `step_${stepIdent}.output`,
        `${stepIdent}.output`,
        `step[${stepIdent}].output`,
      ];
      for (const candidate of candidateKeys) {
        if (Object.prototype.hasOwnProperty.call(context, candidate) && context[candidate] !== undefined) {
          return context[candidate];
        }
      }
    }

    // 5. Short step output lookups (without .output): e.g. {{step1}}, {{step_summarize}}
    const stepShortMatch = key.match(/^step_?([a-zA-Z0-9_-]+)$/i);
    if (stepShortMatch) {
      const stepIdent = stepShortMatch[1];
      const candidateKeys = [
        `step${stepIdent}.output`,
        `step_${stepIdent}.output`,
        `${stepIdent}.output`,
        `step[${stepIdent}].output`,
        stepIdent,
      ];
      for (const candidate of candidateKeys) {
        if (Object.prototype.hasOwnProperty.call(context, candidate) && context[candidate] !== undefined) {
          return context[candidate];
        }
      }
    }

    // 6. Fallback for unfulfilled or missing variables
    return '';
  });
}
