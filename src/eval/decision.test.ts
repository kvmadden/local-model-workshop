/**
 * The published pick, recomputed from the saved replies. Each case below is a fact about the
 * committed evidence, so the docs can quote it without anyone re-running a model.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decide, applyConvention, stableAcrossRuns, nearestRankP95, ModelEvidence, SavedRow } from './decision';
import { scoreCaseV3 } from './sigScoreV3';

const rows = (dir: string, slug: string): SavedRow[] =>
  readFileSync(`eval/results/${dir}/raw-${slug}.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

// Disk sizes come from docs/ORIGINAL-EVALUATION.md. The harness of 2026-10-30 did not record them.
const models: ModelEvidence[] = [
  { id: 'gpt-oss:20b', diskGb: 13.8, runs: [rows('2026-10-30-v2-run1', 'gpt-oss_20b'), rows('2026-10-30-v2-run2', 'gpt-oss_20b')] },
  { id: 'gemma4:31b', diskGb: 19.4, runs: [rows('2026-10-30-v2-run1', 'gemma4_31b'), rows('2026-10-30-v2-run2', 'gemma4_31b')] },
  { id: 'qwen3.8:27b', diskGb: 18.2, runs: [rows('2026-10-30-v2-run1', 'qwen3.8_27b'), rows('2026-10-30-v2-run2', 'qwen3.8_27b')] },
];
const latencies = (dir: string, slug: string) => rows(dir, slug).map((r) => r.latencyMs!);
const p95 = (dir: string) => ({
  'gpt-oss:20b': nearestRankP95(latencies(dir, 'gpt-oss_20b')),
  'gemma4:31b': nearestRankP95(latencies(dir, 'gemma4_31b')),
  'qwen3.8:27b': nearestRankP95(latencies(dir, 'qwen3.8_27b')),
});

describe('decision sensitivity on the saved replies', () => {
  it('only changes as-needed lines anchored at bedtime', () => {
    const golds = readFileSync('eval/sig-extraction/gold.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const changed = golds.filter((g) => applyConvention(g, 'bedtime-prn-has-no-schedule').frequency !== g.frequency).map((g) => g.id);
    expect(changed).toEqual(['s25']);
  });

  it('computes stability from the saved parses: all three gave identical answers in both split-format runs', () => {
    for (const m of models) expect(stableAcrossRuns(m.runs), m.id).toBe(true);
  });

  it('as published (bedtime as-needed = once_daily, latency gate not applied): qwen3.8:27b, by 1.2 GB of disk', () => {
    const d = decide(models, 'bedtime-prn-is-once-daily', { applied: false });
    expect(d.allFields).toEqual({ 'gpt-oss:20b': [24, 24], 'gemma4:31b': [25, 25], 'qwen3.8:27b': [25, 25] });
    expect(d.passedCorrectness).toEqual(['gemma4:31b', 'qwen3.8:27b']);
    expect(d.pick).toBe('qwen3.8:27b');
  });

  it('with the latency gate applied to the 25-line runs: no model is eligible', () => {
    const run1 = decide(models, 'bedtime-prn-is-once-daily', { applied: true, p95ByModel: p95('2026-10-30-v2-run1'), budgetMs: 10000 });
    const run2 = decide(models, 'bedtime-prn-is-once-daily', { applied: true, p95ByModel: p95('2026-10-30-v2-run2'), budgetMs: 10000 });
    expect(run1.pick).toBeNull();
    expect(run2.pick).toBeNull();
  });

  it('with the latency gate applied to the 12-line split-format run: gemma4:31b, because qwen3.8:27b took 12.5 s on its first request', () => {
    const d = decide(models, 'bedtime-prn-is-once-daily', { applied: true, p95ByModel: p95('heldout-v2'), budgetMs: 10000 });
    expect(p95('heldout-v2')).toEqual({ 'gpt-oss:20b': 7664, 'gemma4:31b': 8477, 'qwen3.8:27b': 12510 });
    expect(d.pick).toBe('gemma4:31b');
  });

  it("under the repository's own audit rule (bedtime as-needed has no schedule): gpt-oss:20b", () => {
    const d = decide(models, 'bedtime-prn-has-no-schedule', { applied: false });
    expect(d.allFields).toEqual({ 'gpt-oss:20b': [25, 25], 'gemma4:31b': [24, 24], 'qwen3.8:27b': [24, 24] });
    expect(d.pick).toBe('gpt-oss:20b');
  });

  it('on the 12 template lines the same split appears: 12, 12, 10 under one rule and 10, 10, 12 under the other', () => {
    const count = (slug: string, convention: Parameters<typeof applyConvention>[1]) =>
      rows('heldout-v2', slug).filter((r) => scoreCaseV3(applyConvention(r.gold, convention), r.output, r.input).allCorrect).length;
    expect(['gemma4_31b', 'qwen3.8_27b', 'gpt-oss_20b'].map((s) => count(s, 'bedtime-prn-is-once-daily'))).toEqual([12, 12, 10]);
    expect(['gemma4_31b', 'qwen3.8_27b', 'gpt-oss_20b'].map((s) => count(s, 'bedtime-prn-has-no-schedule'))).toEqual([10, 10, 12]);
  });
});
