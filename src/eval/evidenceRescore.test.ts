/**
 * The committed eval runs are evidence. These tests re-derive every stored verdict and every
 * summary count from the saved raw replies, so a reader does not have to trust the summaries.
 *
 * - Historical scorers (v2 for the split format, the v1 projection for the first format) must
 *   reproduce each stored per-field verdict exactly.
 * - Scorer v3 re-scores the same saved replies. On these development sets it gives the same
 *   verdicts, because no saved reply contained a copied line, a salt swap or a padded reason.
 *   That is reported as a development result, not a new measurement.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { scoreCase, SigGold, SIG_FIELDS } from './sigScore';
import { scoreLegacy, LegacyGold } from './legacyScore';
import { scoreCaseV3 } from './sigScoreV3';

const runs = [
  { dir: 'eval/results/2026-10-30-v2-run1', format: 'split' },
  { dir: 'eval/results/2026-10-30-v2-run2', format: 'split' },
  { dir: 'eval/results/heldout-v2', format: 'split' },
  { dir: 'eval/results/archive/schema-v1/2026-10-30-run1', format: 'first' },
  { dir: 'eval/results/archive/schema-v1/2026-10-30-run2', format: 'first' },
  { dir: 'eval/results/heldout-v1', format: 'first' },
] as const;

type Row = { id: string; input: string; gold: SigGold & LegacyGold; output: string; score: Record<string, boolean> };
const rowsOf = (dir: string, file: string): Row[] => readFileSync(`${dir}/${file}`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const rawFiles = (dir: string) => readdirSync(dir).filter((f) => f.startsWith('raw-') && f.endsWith('.jsonl'));

describe('committed eval evidence', () => {
  it.each(runs)('reproduces every stored verdict in $dir with the scorer that produced it', ({ dir, format }) => {
    for (const file of rawFiles(dir)) {
      for (const row of rowsOf(dir, file)) {
        if (format === 'split') {
          expect(scoreCase(row.gold, row.output), `${dir}/${file} ${row.id}`).toEqual(row.score);
          continue;
        }
        // The first-format runs of 2026-10-30 stored the drug verdict as "medication".
        const again = scoreLegacy(row.gold, row.output);
        const stored = { parsed: row.score.parsed, drug: row.score.medication ?? row.score.drug, dose: row.score.dose, frequency: row.score.frequency, allCorrect: row.score.allCorrect };
        expect({ parsed: again.parsed, drug: again.drug, dose: again.dose, frequency: again.frequency, allCorrect: again.allCorrect }, `${dir}/${file} ${row.id}`).toEqual(stored);
      }
    }
  });

  it.each(runs)('recomputes the stored summary counts in $dir from the raw replies', ({ dir, format }) => {
    const summary = JSON.parse(readFileSync(`${dir}/summary.json`, 'utf8'));
    for (const result of summary.results) {
      const nameKey = 'medication' in result.counts ? 'medication' : 'drug';
      const fields = format === 'split' ? [...SIG_FIELDS] : [nameKey, 'dose', 'frequency'];
      const slug = String(result.label).replace(/[^a-zA-Z0-9.-]+/g, '_');
      const file = `raw-${slug}.jsonl`;
      expect(existsSync(`${dir}/${file}`), `${dir}/${file}`).toBe(true);
      const rows = rowsOf(dir, file);
      expect(result.counts.n).toBe(rows.length);
      expect(result.counts.allCorrect, `${dir} ${result.label}`).toBe(rows.filter((r) => r.score.allCorrect).length);
      for (const field of fields) {
        expect(result.counts[field], `${dir} ${result.label} ${field}`).toBe(rows.filter((r) => r.score[field]).length);
      }
    }
  });

  it('scorer v3 gives the same verdicts as v2 on every saved split-format reply', () => {
    const changed: string[] = [];
    for (const { dir } of runs.filter((r) => r.format === 'split')) {
      for (const file of rawFiles(dir)) {
        for (const row of rowsOf(dir, file)) {
          const v3 = scoreCaseV3(row.gold, row.output, row.input);
          for (const field of [...SIG_FIELDS, 'allCorrect'] as const) {
            if (v3[field] !== row.score[field]) changed.push(`${dir}/${file} ${row.id} ${field}`);
          }
        }
      }
    }
    expect(changed).toEqual([]);
  });
});
