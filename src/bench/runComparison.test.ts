import { describe, it, expect } from 'vitest';
import { buildBench, formatPercentInterval, showValue, fieldValue, DECIDING_LINE } from './runComparison';

const counts = (set: 'dev25' | 'templates12', reading: 'ruling' | 'first-gold') =>
  Object.fromEntries(buildBench(set, reading).columns.map((c) => [c.id, c.allCorrect]));
const misses = (set: 'dev25' | 'templates12', reading: 'ruling' | 'first-gold') =>
  buildBench(set, reading).columns.flatMap((c) => c.runs.flatMap((run, r) => Object.entries(run).filter(([, v]) => !v.allCorrect).map(([id, v]) => `${c.id} run ${r + 1} ${id} ${v.missed.join(',')}`)));

describe('run comparison data', () => {
  it('under the ruling, gpt-oss:20b and the rules parser get every field right, and the other two miss the bedtime line', () => {
    expect(counts('dev25', 'ruling')).toEqual({ 'gpt-oss:20b': [25, 25], 'gemma4:31b': [24, 24], 'qwen3.8:27b': [24, 24], rules: [25] });
    expect(misses('dev25', 'ruling')).toEqual([
      'gemma4:31b run 1 s25 frequency', 'gemma4:31b run 2 s25 frequency',
      'qwen3.8:27b run 1 s25 frequency', 'qwen3.8:27b run 2 s25 frequency',
    ]);
    expect(counts('templates12', 'ruling')).toEqual({ 'gpt-oss:20b': [12], 'gemma4:31b': [10], 'qwen3.8:27b': [10], rules: [12] });
  });

  it('under the gold as first written, the result flips', () => {
    expect(counts('dev25', 'first-gold')).toEqual({ 'gpt-oss:20b': [24, 24], 'gemma4:31b': [25, 25], 'qwen3.8:27b': [25, 25], rules: [25] });
    expect(misses('dev25', 'first-gold')).toEqual(['gpt-oss:20b run 1 s25 frequency', 'gpt-oss:20b run 2 s25 frequency']);
    expect(counts('templates12', 'first-gold')).toEqual({ 'gpt-oss:20b': [10], 'gemma4:31b': [12], 'qwen3.8:27b': [12], rules: [12] });
  });

  it('names the development-data leader the same way the decision tests do, and no model is chosen here', () => {
    expect(buildBench('dev25', 'ruling').decision.pick).toBe('gpt-oss:20b');
    expect(buildBench('dev25', 'first-gold').decision.pick).toBe('qwen3.8:27b');
    expect(buildBench('templates12', 'ruling').decision.stability).toBe('not tested: one run');
  });

  it('keeps the lines in run order, with the deciding bedtime line in each set', () => {
    const dev = buildBench('dev25', 'ruling');
    expect(dev.lines.map((l) => l.id)).toEqual(Array.from({ length: 25 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`));
    expect(dev.lines.find((l) => l.id === DECIDING_LINE.dev25)!.gold.frequency).toBeNull();
    expect(buildBench('dev25', 'first-gold').lines.find((l) => l.id === 's25')!.gold.frequency).toBe('once_daily');
    expect(buildBench('templates12', 'ruling').lines.map((l) => l.id)).toContain(DECIDING_LINE.templates12);
  });

  it('reports stability from the saved parses, and every model reply parsed', () => {
    const dev = buildBench('dev25', 'ruling');
    for (const c of dev.columns.filter((c) => c.kind === 'model')) {
      expect(c.stable, c.id).toBe(true);
      for (const run of c.runs) for (const v of Object.values(run)) expect(v.answer, c.id).not.toBeNull();
    }
    expect(dev.columns.find((c) => c.id === 'rules')!.stable).toBeNull();
  });

  it('prints intervals and values the way the docs do', () => {
    const gpt = buildBench('dev25', 'ruling').columns[0];
    expect(formatPercentInterval(gpt.intervals[0])).toBe('86.3 to 100%');
    expect(formatPercentInterval(buildBench('dev25', 'first-gold').columns[0].intervals[0])).toBe('79.6 to 99.9%');
    const s25 = buildBench('dev25', 'ruling').lines.find((l) => l.id === 's25')!;
    expect(showValue('dose', fieldValue(s25.gold, 'dose'))).toBe('3 mg');
    expect(showValue('frequency', fieldValue(s25.gold, 'frequency'))).toBe('none');
    expect(showValue('timing', fieldValue(s25.gold, 'timing'))).toBe('bedtime');
    expect(showValue('prn', fieldValue(s25.gold, 'prn'))).toBe('yes');
  });
});
