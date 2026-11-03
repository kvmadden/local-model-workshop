/**
 * docs/DEVELOPMENT-RESULTS.md says every number on it is checked against the evidence. This test
 * is that check: it recomputes each table from the committed raw replies and summaries and compares
 * the page with the result, cell by cell. Editing a number on the page without changing the
 * evidence, or changing the evidence without the page, fails `npm test`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { exactInterval, nearestRank } from './harness';
import { decide, nearestRankP95, type Convention, type ModelEvidence, type SavedRow } from './decision';
import { rulesSig } from './sigBaselines';
import { SIG_FIELDS } from './sigScore';

const doc = readFileSync('docs/DEVELOPMENT-RESULTS.md', 'utf8');
const lines = doc.split('\n');

/** The body rows of the markdown table whose header row starts with `header`, as trimmed cells. */
function table(header: string): string[][] {
  const start = lines.findIndex((l) => l.startsWith(header));
  if (start === -1) throw new Error(`docs/DEVELOPMENT-RESULTS.md has no table starting "${header}"`);
  const rows: string[][] = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
  return rows;
}

type Row = SavedRow & { score: Record<string, boolean> };
const raw = (dir: string, slug: string): Row[] => readFileSync(`eval/results/${dir}/raw-${slug}.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const allRight = (dir: string, slug: string) => raw(dir, slug).filter((r) => r.score.allCorrect).length;
const summary = (dir: string) => JSON.parse(readFileSync(`eval/results/${dir}/summary.json`, 'utf8'));
const baselineCounts = (dir: string, label: string) => summary(dir).results.find((r: { label: string }) => r.label === label).counts;

const SPLIT_25 = ['2026-10-30-v2-run1', '2026-10-30-v2-run2'] as const;
const FIRST_25 = ['archive/schema-v1/2026-10-30-run1', 'archive/schema-v1/2026-10-30-run2'] as const;
const MODELS = [['gpt-oss:20b', 'gpt-oss_20b', 13.8], ['gemma4:31b', 'gemma4_31b', 19.4], ['qwen3.8:27b', 'qwen3.8_27b', 18.2]] as const;

const pct = (x: number) => (x === 1 ? '100' : x === 0 ? '0' : (x * 100).toFixed(1));
const interval = (k: number, n: number) => {
  const [lo, hi] = exactInterval(k, n);
  return `[${pct(lo)} to ${pct(hi)}%]`;
};
/** "k/n", with the exact interval when asked and k is above zero. */
const count = (k: number, n: number, withInterval: boolean) => `${k}/${n}${withInterval && k > 0 ? ` ${interval(k, n)}` : ''}`;
const twoRuns = (dirs: readonly string[], slug: string, n: number, withInterval: boolean) => {
  const [a, b] = dirs.map((d) => allRight(d, slug));
  return `${a}/${n} and ${b}/${n}${withInterval && a === b && a > 0 ? ` ${interval(a, n)}` : ''}`;
};

describe('docs/DEVELOPMENT-RESULTS.md matches the evidence', () => {
  it('table "Every field right"', () => {
    const expected = [
      ...MODELS.map(([label, slug]) => [label, twoRuns(SPLIT_25, slug, 25, true), count(allRight('heldout-v2', slug), 12, true), twoRuns(FIRST_25, slug, 25, false), count(allRight('heldout-v1', slug), 12, false)]),
      ...([['Rules parser (no model)', 'baseline: rules'], ['Constant answer', 'baseline: constant'], ['Copy the line into every field', 'baseline: copy']] as const).map(([label, key]) => [
        label,
        count(baselineCounts('2026-11-03-baselines-dev25', key).allCorrect, 25, true),
        count(baselineCounts('2026-11-03-baselines-templates12', key).allCorrect, 12, true),
        'not run',
        'not run',
      ]),
      ['Echo mock', twoRuns(SPLIT_25, 'mock_echo_', 25, true), count(allRight('heldout-v2', 'mock_echo_'), 12, true), twoRuns(FIRST_25, 'mock_echo_', 25, false), count(allRight('heldout-v1', 'mock_echo_'), 12, false)],
    ];
    expect(table('| Row | 25 lines, split format |')).toEqual(expected);
  });

  it('table "Per field, against a floor", and each model row is the same in both runs', () => {
    const perField = (dir: string, slug: string) => SIG_FIELDS.map((f) => raw(dir, slug).filter((r) => r.score[f]).length);
    for (const [, slug] of MODELS) expect(perField(SPLIT_25[1], slug), slug).toEqual(perField(SPLIT_25[0], slug));
    const constant = baselineCounts('2026-11-03-baselines-dev25', 'baseline: constant');
    const expected = [
      ...MODELS.map(([label, slug]) => [label, ...perField(SPLIT_25[0], slug).map((k) => `${k}/25`)]),
      ['Constant answer', ...SIG_FIELDS.map((f) => `${constant[f]}/25`)],
    ];
    expect(table('| Row | Drug | Dose |')).toEqual(expected);
  });

  it('the miss count and the answer count', () => {
    const dirs = [...SPLIT_25, 'heldout-v2', ...FIRST_25, 'heldout-v1'];
    const answers = dirs.flatMap((d) => MODELS.flatMap(([, slug]) => raw(d, slug)));
    expect(answers).toHaveLength(372);
    expect(answers.filter((r) => !r.score.allCorrect)).toHaveLength(10);
    expect(doc).toContain('372 model answers were scored');
    expect(doc).toContain('All 10 misses');
  });

  it('table "Six lines hold instructions the six fields cannot score"', () => {
    const dev = readFileSync('eval/sig-extraction/cases.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { id: string; input: string });
    const unread = dev.map((c) => [c.id, rulesSig(c.input).unread] as const).filter(([, u]) => u.length > 0);
    const rows = table('| Line | Unread words |');
    expect(rows.map((r) => r[0])).toEqual(unread.map(([id]) => id));
    for (const [id, words] of unread) {
      const cell = rows.find((r) => r[0] === id)![1].toLowerCase();
      for (const w of words) expect(cell, id).toContain(w);
    }
    expect(doc).toContain(`On the 25 lines it could not read part of ${unread.length}:`);
  });

  it('table "The pick depends on one label rule"', () => {
    const evidence = (dirs: readonly string[]): ModelEvidence[] => MODELS.map(([id, slug, diskGb]) => ({ id, diskGb, runs: dirs.map((d) => raw(d, slug)) }));
    const p95 = (dir: string) => Object.fromEntries(MODELS.map(([id, slug]) => [id, nearestRankP95(raw(dir, slug).map((r) => r.latencyMs!))]));
    const rows = table('| Rule for "at bedtime as needed" | Lines and runs |');
    expect(rows).toHaveLength(8);
    for (const [rule, set, gate, counts, pickCell] of rows) {
      const convention: Convention = rule.startsWith('No schedule') ? 'bedtime-prn-has-no-schedule' : 'bedtime-prn-is-once-daily';
      const dirs = set.startsWith('25 lines') ? SPLIT_25 : (['heldout-v2'] as const);
      const models = evidence(dirs);
      const decisions = gate.startsWith('Applied')
        ? dirs.map((d) => decide(models, convention, { applied: true, p95ByModel: p95(d), budgetMs: 10000 }))
        : [decide(models, convention, { applied: false })];
      const picks = [...new Set(decisions.map((d) => d.pick ?? 'None'))];
      expect(picks, `${rule} / ${set} / ${gate}`).toHaveLength(1);
      expect(pickCell.startsWith(picks[0]), `${rule} / ${set} / ${gate}: page says "${pickCell}", evidence says ${picks[0]}`).toBe(true);
      const perRun = MODELS.map(([id]) => decisions[0].allFields[id]);
      const shown = perRun.map((runs) => runs[0]).join(', ') + (dirs.length > 1 ? ' in each run' : '');
      for (const runs of perRun) expect(new Set(runs).size, 'the same count in each run').toBe(1);
      expect(counts, `${rule} / ${set} / ${gate}`).toBe(shown);
    }
  });

  it('table "Latency: what the saved runs show and do not show", and the notes under it', () => {
    const runs: Array<[string, string]> = [
      ['First format, 25 lines, run 1', FIRST_25[0]],
      ['First format, 25 lines, run 2', FIRST_25[1]],
      ['Split format, 25 lines, run 1', SPLIT_25[0]],
      ['Split format, 25 lines, run 2', SPLIT_25[1]],
      ['Split format, 12 lines', 'heldout-v2'],
    ];
    const p95s = (dir: string) => MODELS.map(([, slug]) => nearestRankP95(raw(dir, slug).map((r) => r.latencyMs!)));
    const load = (dir: string) => {
      const samples = summary(dir).results.filter((r: { label: string }) => !r.label.startsWith('mock')).flatMap((r: { loadAvg1m?: { start: number; end: number } }) => (r.loadAvg1m ? [r.loadAvg1m.start, r.loadAvg1m.end] : []));
      return samples.length ? `${Math.round(Math.min(...samples))} to ${Math.round(Math.max(...samples))}` : 'not recorded';
    };
    for (const dir of runs.map(([, d]) => d)) expect(summary(dir).hardware.cores).toBe(10);
    expect(table('| Runs | 1-minute load (10 cores) |')).toEqual(runs.map(([label, dir]) => [label, load(dir), `${p95s(dir).map((ms) => (ms / 1000).toFixed(1)).join(' / ')} s`]));

    // Note 1: who met the 10-second budget.
    const met = (dir: string) => MODELS.filter((_, i) => p95s(dir)[i] <= 10000).map(([id]) => id);
    expect(met(FIRST_25[0])).toEqual(['gemma4:31b', 'qwen3.8:27b']);
    expect(met(FIRST_25[1])).toEqual(['gpt-oss:20b', 'gemma4:31b', 'qwen3.8:27b']);
    expect(met('heldout-v2')).toEqual(['gpt-oss:20b', 'gemma4:31b']);
    expect(met(SPLIT_25[0])).toEqual([]);
    expect(met(SPLIT_25[1])).toEqual([]);
    expect(doc).toContain('In the first-format runs, gemma and qwen met it in run 1 and all three met it in run 2. In the 12-line split-format run, gpt-oss and gemma met it.');

    // Note 2: the first request after warm-up.
    const dirs = [...SPLIT_25, 'heldout-v2', ...FIRST_25, 'heldout-v1'];
    const firstIsSlowest = (slug: string) => dirs.filter((d) => {
      const l = raw(d, slug).map((r) => r.latencyMs!);
      return l.indexOf(Math.max(...l)) === 0;
    }).length;
    expect(doc).toContain(`For qwen3.8:27b that held in ${firstIsSlowest('qwen3.8_27b')} of 6 runs, for gemma4:31b in ${firstIsSlowest('gemma4_31b')} of 6, and for gpt-oss:20b in ${firstIsSlowest('gpt-oss_20b')} of 6.`);
    const qwen12 = raw('heldout-v2', 'qwen3.8_27b').map((r) => r.latencyMs!);
    expect(doc).toContain(`qwen's ${(qwen12[0] / 1000).toFixed(1)} s on the 12 lines is its first request. Without it, its slowest line took ${(Math.max(...qwen12.slice(1)) / 1000).toFixed(1)} s.`);

    // Note 3: the p50 on the 12 lines in each format, and the load during each run.
    const p50 = (dir: string, slug: string) => (nearestRank(raw(dir, slug).map((r) => r.latencyMs!), 50)! / 1000).toFixed(1);
    const [gpt, gemma, qwen] = MODELS.map(([, slug]) => [p50('heldout-v1', slug), p50('heldout-v2', slug)]);
    expect(doc).toContain(`from ${gpt[0]} to ${gpt[1]} s for gpt-oss, ${gemma[0]} to ${gemma[1]} s for gemma, and ${qwen[0]} to ${qwen[1]} s for qwen.`);
    expect(doc).toContain(`with a 1-minute load of ${load('heldout-v1')} for the first format and ${load('heldout-v2')} for the split format.`);
  });

  it('the line lengths it states', () => {
    const inputs = [
      ...readFileSync('eval/sig-extraction/cases.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l).input as string),
      ...(JSON.parse(readFileSync('eval/heldout/frozen.json', 'utf8')).cases as { input: string }[]).map((c) => c.input),
    ];
    const lengths = inputs.map((s) => s.length);
    expect(doc).toContain(`The lines are ${Math.min(...lengths)} to ${Math.max(...lengths)} characters`);
  });
});
