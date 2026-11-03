import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseEvalArgs, assertNewOutputDir, seededShuffle, exactInterval, nearestRank, latencySummary, loadSummary,
} from './harness';

describe('eval harness helpers', () => {
  it('parses options, keeps --heldout working, and says the template set is development data', () => {
    const o = parseEvalArgs(['--', '--heldout', '--models', 'a,b', '--seed', '7', '--warmups', '0']);
    expect(o).toMatchObject({ suite: 'templates12', models: ['a', 'b'], seed: 7, warmups: 0, format: 'split', scorer: 'v3', order: 'random' });
    expect(o.notes[0]).toMatch(/development data/);
    expect(parseEvalArgs(['--mock-only']).baselinesOnly).toBe(true);
    expect(parseEvalArgs(['--schema-v1']).format).toBe('first');
    expect(() => parseEvalArgs(['--bogus'])).toThrow(/Unknown option --bogus/);
    expect(() => parseEvalArgs(['--out'])).toThrow(/needs a value/);
    expect(() => parseEvalArgs(['--scorer', 'v9'])).toThrow(/v3 or v2/);
    expect(() => parseEvalArgs(['--timeout-ms', '0'])).toThrow(/positive integer/);
  });

  it('never reuses an output folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eval-out-'));
    try {
      expect(() => assertNewOutputDir(dir)).toThrow(/already exists/);
      expect(() => assertNewOutputDir(join(dir, 'new'))).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('shuffles deterministically from a seed and keeps every item', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const a = seededShuffle(items, 20261103);
    expect(seededShuffle(items, 20261103)).toEqual(a);
    expect(a).not.toEqual(items);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
  });

  it('computes exact binomial intervals', () => {
    const [lo25, hi25] = exactInterval(25, 25);
    expect(lo25).toBeCloseTo(0.863, 3);
    expect(hi25).toBe(1);
    const [lo12] = exactInterval(12, 12);
    expect(lo12).toBeCloseTo(0.735, 3);
    const [lo, hi] = exactInterval(24, 25);
    expect(lo).toBeCloseTo(0.796, 3);
    expect(hi).toBeCloseTo(0.999, 3);
    expect(exactInterval(0, 25)[0]).toBe(0);
  });

  it('counts every request in latency, reports the first request apart, and flags p95 that is just the max', () => {
    // The saved 12-line split-format run for qwen3.8:27b, in run order.
    const saved = [12510, 4848, 4556, 4199, 4722, 4494, 4330, 5509, 4726, 4201, 4795, 4487];
    const s = latencySummary(saved.map((ms, i) => ({ ms, error: false, position: i + 1 })), 10000);
    expect(s).toMatchObject({ requests: 12, errors: 0, p95: 12510, max: 12510, p95IsMax: true, firstRequestMs: 12510, p95WithoutFirst: 5509, withinBudget: 11 });
    const withFailure = latencySummary([{ ms: 3000, error: false, position: 1 }, { ms: 60000, error: true, position: 2 }], 10000);
    expect(withFailure).toMatchObject({ requests: 2, errors: 1, max: 60000, withinBudget: 1 });
    expect(nearestRank([], 95)).toBeNull();
  });

  it('summarizes load samples', () => {
    expect(loadSummary([3, 1, 2])).toEqual({ samples: 3, min: 1, median: 2, max: 3 });
    expect(loadSummary([])).toEqual({ samples: 0, min: null, median: null, max: null });
  });
});

describe('eval CLI', () => {
  const cli = (args: string[]) => spawnSync(process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/eval-sig.ts', '--', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } });

  it('prints help, and rejects unknown options', () => {
    const help = cli(['--help']);
    expect(help.status).toBe(0);
    expect(help.stdout).toMatch(/Usage: npm run eval/);
    const bad = cli(['--nope']);
    expect(bad.status).toBe(2);
    expect(bad.stderr).toMatch(/Unknown option --nope/);
  });

  it('runs the baselines offline, writes a manifest, and refuses to write into the same folder twice', () => {
    const base = mkdtempSync(join(tmpdir(), 'eval-cli-'));
    const out = join(base, 'run');
    try {
      const first = cli(['--baselines-only', '--out', out]);
      expect(first.status, first.stderr).toBe(0);
      const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
      expect(summary.suite.status).toMatch(/development data/);
      expect(summary.scorer).toMatch(/sig-v3/);
      expect(summary.hashes['eval/sig-extraction/gold.jsonl']).toMatch(/^[0-9a-f]{64}$/);
      const rules = summary.results.find((r: { label: string }) => r.label === 'baseline: rules');
      expect(rules.counts.allCorrect).toBe(25);
      expect(rules.unreadLines.map((u: { id: string }) => u.id)).toEqual(['s04', 's05', 's10', 's12', 's13', 's19']);
      const before = readdirSync(out).map((f) => [f, readFileSync(join(out, f), 'utf8')]);

      const again = cli(['--baselines-only', '--out', out]);
      expect(again.status).toBe(1);
      expect(again.stderr).toMatch(/already exists/);
      expect(readdirSync(out).map((f) => [f, readFileSync(join(out, f), 'utf8')])).toEqual(before);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('runs a suite file and checks that every case has exactly one gold record', () => {
    const base = mkdtempSync(join(tmpdir(), 'eval-suite-'));
    try {
      const gold = { drug: 'examplamine', drug_match: 'examplamine', dose_per_administration: { value: 10, unit: 'mg' }, frequency: 'once_daily', timing: null, prn: false, prn_indication: null };
      const good = join(base, 'suite.json');
      writeFileSync(good, JSON.stringify({ status: 'test fixture', cases: [{ id: 'x1', input: 'Examplamine 10 mg tablet, take 1 tablet by mouth once daily', gold }] }));
      const ok = cli(['--baselines-only', '--suite', good, '--out', join(base, 'ok')]);
      expect(ok.status, ok.stderr).toBe(0);
      expect(JSON.parse(readFileSync(join(base, 'ok', 'summary.json'), 'utf8')).suite).toEqual({ name: 'suite.json', status: 'test fixture', n: 1 });
      const dup = join(base, 'dup.json');
      writeFileSync(dup, JSON.stringify({ cases: [{ id: 'x1', input: 'a', gold }, { id: 'x1', input: 'b', gold }] }));
      mkdirSync(join(base, 'unused'), { recursive: true });
      const bad = cli(['--baselines-only', '--suite', dup, '--out', join(base, 'dup-out')]);
      expect(bad.status).not.toBe(0);
      expect(bad.stderr).toMatch(/share an id/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
