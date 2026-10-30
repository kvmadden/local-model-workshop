import { describe, it, expect } from 'vitest';
import { resolveOllamaModel } from './ollamaService';
import catalog from '../data/models.json';

// FAMILY_KEYWORDS in ollamaService.ts is a deliberately-closed list: a family it
// does not name parses to null, and `resolveOllamaModel` then returns null for
// that card. The visible result is a card reporting "not installed" while the
// model sits on disk — a falsehood in the surface whose whole job is to prevent
// one.
//
// The catalogue and the keyword list are therefore required to move in lockstep,
// and until now that rule lived only in a comment and a backlog row. This makes
// it executable: add a card for a family the resolver cannot parse and this
// fails, naming the word to add.
//
// It asserts a RELATIONSHIP, not a roster — it does not care which models are in
// the catalogue, so a refresh that swaps every card still passes as long as the
// keyword list keeps up.

type CatalogEntry = { name?: string; ollamaPull?: string | null };

const entries = (Array.isArray(catalog) ? catalog : Object.values(catalog)) as CatalogEntry[];

/** `ollama pull deepseek-r1:8b` -> `deepseek-r1:8b` */
function pullTarget(entry: CatalogEntry): string | null {
  const cmd = entry.ollamaPull;
  if (!cmd) return null;
  const m = /ollama\s+pull\s+(\S+)/.exec(cmd);
  return m ? m[1] : null;
}

describe('catalogue and FAMILY_KEYWORDS move in lockstep', () => {
  it('has cards to check', () => {
    // Guards the assertion below against passing vacuously: an empty catalogue,
    // or one whose pull commands stopped parsing, would otherwise look green.
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((e) => pullTarget(e) !== null).length).toBeGreaterThan(0);
  });

  it('every card with an ollamaPull is resolvable by the version resolver', () => {
    const unresolvable: string[] = [];

    for (const entry of entries) {
      const target = pullTarget(entry);
      if (!target) continue; // Whisper has no pull command; nothing to resolve.

      // Offer the resolver the exact model the card would pull. If the family is
      // known, this is an exact match; if the family word is missing it returns
      // null, which is the bug this test exists to catch.
      const resolution = resolveOllamaModel(target, [
        { name: target, model: target, size: 0, digest: '', modified_at: '' } as never,
      ]);

      if (!resolution) {
        unresolvable.push(`${entry.name ?? '(unnamed)'} -> ${target}`);
      }
    }

    expect(
      unresolvable,
      'These cards name a model the resolver cannot parse. Add the family word to '
        + 'FAMILY_KEYWORDS in src/services/ollamaService.ts — without it the card '
        + 'reports "not installed" even when the model is present:\n  '
        + unresolvable.join('\n  '),
    ).toEqual([]);
  });
});
