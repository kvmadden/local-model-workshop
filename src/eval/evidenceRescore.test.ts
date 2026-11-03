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
import { scoreCaseV3, parsePredictionV3, drugMatches, doseMatchesV3 } from './sigScoreV3';

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

  it('scorer v3 gives the same verdicts as v2 on every saved split-format reply, parse status included', () => {
    const changed: string[] = [];
    let compared = 0;
    for (const { dir } of runs.filter((r) => r.format === 'split')) {
      for (const file of rawFiles(dir)) {
        for (const row of rowsOf(dir, file)) {
          const v3 = scoreCaseV3(row.gold, row.output, row.input);
          compared++;
          for (const field of ['parsed', ...SIG_FIELDS, 'allCorrect'] as const) {
            if (v3[field] !== row.score[field]) changed.push(`${dir}/${file} ${row.id} ${field}`);
          }
        }
      }
    }
    // 3 models and the echo mock, on 25 + 25 + 12 lines.
    expect(compared).toBe(248);
    expect(changed).toEqual([]);
  });

  it('scorer v3 drug and dose checks agree with the stored verdicts on every saved first-format reply', () => {
    const changed: string[] = [];
    let compared = 0;
    for (const { dir } of runs.filter((r) => r.format === 'first')) {
      for (const file of rawFiles(dir)) {
        for (const row of rowsOf(dir, file)) {
          const stored = { drug: row.score.medication ?? row.score.drug, dose: row.score.dose };
          const p = parsePredictionV3(row.output).value as Record<string, unknown> | null;
          const v3 = p
            ? { drug: drugMatches(p.medication, row.gold.medication, row.input), dose: doseMatchesV3({ value: p.dose_value, unit: p.dose_unit }, { value: row.gold.dose_value, unit: row.gold.dose_unit }) }
            : { drug: false, dose: false };
          compared++;
          if (v3.drug !== stored.drug) changed.push(`${dir}/${file} ${row.id} drug`);
          if (v3.dose !== stored.dose) changed.push(`${dir}/${file} ${row.id} dose`);
        }
      }
    }
    expect(compared).toBe(248);
    expect(changed).toEqual([]);
  });

  it('none of the 372 model answers got the drug or the dose wrong, under the stored verdicts and under v3', () => {
    let answers = 0;
    const wrong: string[] = [];
    for (const { dir, format } of runs) {
      for (const file of rawFiles(dir).filter((f) => !f.includes('mock'))) {
        for (const row of rowsOf(dir, file)) {
          answers++;
          const drug = format === 'split' ? row.score.drug : row.score.medication ?? row.score.drug;
          if (!drug || !row.score.dose) wrong.push(`${dir}/${file} ${row.id} stored`);
          const p = parsePredictionV3(row.output).value as Record<string, unknown> | null;
          const v3 = format === 'split'
            ? scoreCaseV3(row.gold, row.output, row.input)
            : { drug: !!p && drugMatches(p.medication, row.gold.medication, row.input), dose: !!p && doseMatchesV3({ value: p.dose_value, unit: p.dose_unit }, { value: row.gold.dose_value, unit: row.gold.dose_unit }) };
          if (!v3.drug || !v3.dose) wrong.push(`${dir}/${file} ${row.id} v3`);
        }
      }
    }
    expect(answers).toBe(372);
    expect(wrong).toEqual([]);
  });
});
