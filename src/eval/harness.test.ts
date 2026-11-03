import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { runBaseline } from './sigBaselines';
import {
  parseEvalArgs, assertNewOutputDir, seededShuffle, exactInterval, nearestRank, latencySummary, loadSummary,
  ollamaBaseUrl, selectModels, importClosure,
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
  }, 30000);

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
  }, 30000);

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
  }, 30000);
});

// Review round 2 (3 Nov). Helpers behind the CLI fixes below.
describe('eval harness helpers: review round 2', () => {
  it('reads OLLAMA_HOST the way Ollama does (Grok 10)', () => {
    expect(ollamaBaseUrl(undefined)).toBe('http://localhost:11434');
    expect(ollamaBaseUrl('')).toBe('http://localhost:11434');
    expect(ollamaBaseUrl('127.0.0.1:11434')).toBe('http://127.0.0.1:11434');
    expect(ollamaBaseUrl('localhost')).toBe('http://localhost:11434');
    expect(ollamaBaseUrl('[::1]:11434')).toBe('http://[::1]:11434');
    expect(ollamaBaseUrl('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434');
    expect(ollamaBaseUrl('0.0.0.0')).toBe('http://0.0.0.0:11434');
  });

  it('refuses a --models name that is not configured, and keeps the configured order (GPT 11, Grok 12)', () => {
    const configured = [{ model: 'gpt-oss:20b' }, { model: 'gemma4:31b' }, { model: 'qwen3.8:27b' }];
    expect(selectModels(configured, undefined)).toEqual(configured);
    expect(selectModels(configured, ['qwen3.8:27b', 'gpt-oss:20b']).map((m) => m.model)).toEqual(['gpt-oss:20b', 'qwen3.8:27b']);
    expect(() => selectModels(configured, ['gemma4:31bb'])).toThrow(/gemma4:31bb, which is not in eval\/sig-extraction\/models.json/);
    expect(() => selectModels([], undefined)).toThrow(/lists no models/);
  });

  it('finds every source file the eval CLI imports (GPT 13)', () => {
    const files = importClosure('scripts/eval-sig.ts', process.cwd());
    expect(files).toEqual(expect.arrayContaining(['scripts/eval-sig.ts', 'src/engine/flowRunner.ts', 'src/engine/modelAdapter.ts', 'src/engine/mockEndpoint.ts', 'src/engine/templateResolver.ts', 'src/eval/harness.ts', 'src/eval/sigScore.ts', 'src/eval/sigScoreV3.ts', 'src/eval/legacyScore.ts', 'src/eval/sigBaselines.ts', 'src/types/flow.ts']));
    expect(files.every((f) => !f.startsWith('..') && !f.includes('node_modules'))).toBe(true);
  });
});

// Review round 2 (3 Nov). The latency facts the docs quote, read from the saved files.
describe('saved latency facts', () => {
  // The harness of 2026-10-30 ran the cases in file order and wrote each row as it finished, so
  // row order in these files is run order (git show 1c38c16:scripts/eval-sig.ts, the case loop).
  const dirs = ['2026-10-30-v2-run1', '2026-10-30-v2-run2', 'heldout-v2', 'archive/schema-v1/2026-10-30-run1', 'archive/schema-v1/2026-10-30-run2', 'heldout-v1'];
  const latencies = (dir: string, slug: string): number[] =>
    readFileSync(`eval/results/${dir}/raw-${slug}.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l).latencyMs);

  it('qwen3.8:27b on the 12 template lines: 12.5 s on its first request, 5.5 s at most after it (Grok 15)', () => {
    const q = latencies('heldout-v2', 'qwen3.8_27b');
    expect(q[0]).toBe(12510);
    expect(Math.max(...q.slice(1))).toBe(5509);
    const s = latencySummary(q.map((ms, i) => ({ ms, error: false, position: i + 1 })), 10000);
    expect(s).toMatchObject({ requests: 12, p95: 12510, p95IsMax: true, firstRequestMs: 12510, p95WithoutFirst: 5509, withinBudget: 11 });
  });

  it('the slowest request was the first one in 6 of 6 runs for qwen3.8:27b, 2 of 6 for gemma4:31b and 0 of 6 for gpt-oss:20b', () => {
    const firstIsSlowest = (slug: string) => dirs.filter((d) => {
      const l = latencies(d, slug);
      return l.indexOf(Math.max(...l)) === 0;
    }).length;
    expect([firstIsSlowest('qwen3.8_27b'), firstIsSlowest('gemma4_31b'), firstIsSlowest('gpt-oss_20b')]).toEqual([6, 2, 0]);
  });
});

// Review round 2 (3 Nov). The eval CLI against a fake Ollama on this machine. No model runs.
describe('eval CLI against a fake local Ollama', () => {
  type Seen = { route: string; body: any };
  const runCli = (args: string[], env: Record<string, string> = {}, onSpawn?: (child: ReturnType<typeof spawn>) => void) =>
    new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/eval-sig.ts', '--', ...args], { env: { PATH: process.env.PATH ?? '', ...env } });
      onSpawn?.(child);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    });

  const WARMUP_LINE = 'Examplamine 10 mg tablet, take 1 tablet by mouth once daily';
  const lineOf = (prompt: string) => /Line: (.*)\n/.exec(prompt)?.[1] ?? '';

  /** A fake Ollama. `onGenerate` can fail a request or look at the output folder while the run is going. */
  async function fakeOllama(options: { onGenerate?: (line: string, seen: Seen[]) => { status: number; body: unknown } | 'hang' | undefined; failShow?: string } = {}) {
    const seen: Seen[] = [];
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const body = raw ? JSON.parse(raw) : undefined;
        seen.push({ route: req.url ?? '', body });
        const send = (status: number, payload: unknown) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        };
        if (req.url === '/api/version') return send(200, { version: 'fake-0' });
        if (req.url === '/api/tags') return send(200, { models: ['gpt-oss:20b', 'gemma4:31b', 'qwen3.8:27b'].map((name) => ({ name, digest: `digest-${name}`, size: 1 })) });
        if (req.url === '/api/ps') return send(200, { models: [] });
        if (req.url === '/api/show') return body?.model === options.failShow ? send(500, { error: 'show failed' }) : send(200, { details: { parameter_size: '1B', quantization_level: 'Q4', family: 'fake' } });
        if (req.url === '/api/generate') {
          if (body?.keep_alive === 0) return send(200, {});
          const line = lineOf(body.prompt);
          const custom = options.onGenerate?.(line, seen);
          if (custom === 'hang') return undefined;
          if (custom) return send(custom.status, custom.body);
          return send(200, { response: runBaseline('rules', line).text });
        }
        send(404, { error: 'unknown route' });
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as AddressInfo).port;
    return { port, seen, close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }) };
  }

  const suiteFile = (dir: string) => {
    const gold = { drug: 'examplamine', drug_match: 'examplamine', dose_per_administration: { value: 10, unit: 'mg' }, frequency: 'once_daily', timing: null, prn: false, prn_indication: null };
    const file = join(dir, 'suite.json');
    writeFileSync(file, JSON.stringify({ status: 'test fixture', cases: ['a1', 'a2', 'a3'].map((id, i) => ({ id, input: `Examplamine ${10} mg tablet, take 1 tablet by mouth once daily (${i})`, gold })) }));
    return file;
  };

  it('refuses a --models name that is not in models.json before writing anything (GPT 11, Grok 12)', async () => {
    const fake = await fakeOllama();
    const base = mkdtempSync(join(tmpdir(), 'eval-r2-'));
    try {
      const out = join(base, 'run');
      const r = await runCli(['--models', 'gemma4:31bb', '--suite', suiteFile(base), '--out', out], { OLLAMA_HOST: `http://127.0.0.1:${fake.port}` });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/gemma4:31bb/);
      expect(existsSync(out)).toBe(false);
    } finally {
      await fake.close();
      rmSync(base, { recursive: true, force: true });
    }
  }, 30000);

  it('reads OLLAMA_HOST written without a scheme, the way Ollama itself does (Grok 10)', async () => {
    const fake = await fakeOllama();
    const base = mkdtempSync(join(tmpdir(), 'eval-r2-'));
    try {
      const out = join(base, 'run');
      const r = await runCli(['--models', 'gemma4:31b', '--suite', suiteFile(base), '--warmups', '0', '--out', out], { OLLAMA_HOST: `127.0.0.1:${fake.port}` });
      expect(r.status, r.stderr).toBe(0);
      const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
      expect(summary.results.map((x: { label: string }) => x.label)).toContain('gemma4:31b');
    } finally {
      await fake.close();
      rmSync(base, { recursive: true, force: true });
    }
  }, 30000);

  it('records failed warm-ups, and writes each reply to disk as soon as it is scored (GPT 12)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'eval-r2-'));
    const out = join(base, 'run');
    const rowsOnDisk: number[] = [];
    const fake = await fakeOllama({
      onGenerate: (line) => {
        if (line === WARMUP_LINE) return { status: 500, body: { error: 'warm-up failed' } };
        const file = join(out, 'raw-gemma4_31b.jsonl');
        rowsOnDisk.push(existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).length : -1);
        return undefined;
      },
    });
    try {
      const r = await runCli(['--models', 'gemma4:31b', '--suite', suiteFile(base), '--order', 'fixed', '--out', out], { OLLAMA_HOST: `http://127.0.0.1:${fake.port}` });
      expect(r.status, r.stderr).toBe(0);
      expect(rowsOnDisk).toEqual([0, 1, 2]);
      const model = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')).results.find((x: { label: string }) => x.label === 'gemma4:31b');
      expect(model.warmups).toHaveLength(2);
      expect(model.warmups.every((w: { error: string | null }) => /warm-up failed|HTTP 500/.test(w.error ?? ''))).toBe(true);
    } finally {
      await fake.close();
      rmSync(base, { recursive: true, force: true });
    }
  }, 30000);

  it('writes a summary marked incomplete when a run stops partway (GPT 12, Grok 13)', async () => {
    const fake = await fakeOllama({ failShow: 'qwen3.8:27b' });
    const base = mkdtempSync(join(tmpdir(), 'eval-r2-'));
    try {
      const out = join(base, 'run');
      const r = await runCli(['--models', 'gemma4:31b,qwen3.8:27b', '--suite', suiteFile(base), '--order', 'fixed', '--warmups', '0', '--out', out], { OLLAMA_HOST: `http://127.0.0.1:${fake.port}` });
      expect(r.status).toBe(1);
      const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
      expect(summary.complete).toBe(false);
      expect(summary.error).toMatch(/show/);
      expect(summary.results.map((x: { label: string }) => x.label)).toContain('gemma4:31b');
      expect(readFileSync(join(out, 'raw-gemma4_31b.jsonl'), 'utf8').trim().split('\n')).toHaveLength(3);
    } finally {
      await fake.close();
      rmSync(base, { recursive: true, force: true });
    }
  }, 30000);

  it('keeps the rows already scored, and writes a summary marked incomplete, when the run is interrupted (GPT 12)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'eval-r2-'));
    let child: ReturnType<typeof spawn> | undefined;
    let timedRequests = 0;
    const fake = await fakeOllama({
      onGenerate: (line) => {
        if (line === WARMUP_LINE) return undefined;
        timedRequests++;
        if (timedRequests < 2) return undefined;
        // The second timed request never answers. Interrupt the run while it waits.
        setTimeout(() => child?.kill('SIGINT'), 200);
        return 'hang';
      },
    });
    try {
      const out = join(base, 'run');
      const r = await runCli(['--models', 'gemma4:31b', '--suite', suiteFile(base), '--order', 'fixed', '--warmups', '0', '--out', out], { OLLAMA_HOST: `http://127.0.0.1:${fake.port}` }, (c) => (child = c));
      expect(r.status).toBe(130);
      const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
      expect(summary).toMatchObject({ complete: false, error: 'interrupted by SIGINT', inProgress: { model: 'gemma4:31b', rowsWritten: 1 } });
      expect(readFileSync(join(out, 'raw-gemma4_31b.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
    } finally {
      await fake.close();
      rmSync(base, { recursive: true, force: true });
    }
  }, 30000);

  it('hashes the inputs before the first request, and reports a file that changed during the run (GPT 13)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'eval-r2-'));
    const suite = suiteFile(base);
    const original = createHash('sha256').update(readFileSync(suite)).digest('hex');
    let changed = false;
    const fake = await fakeOllama({
      onGenerate: (line) => {
        if (line !== WARMUP_LINE && !changed) {
          appendFileSync(suite, ' ');
          changed = true;
        }
        return undefined;
      },
    });
    try {
      const out = join(base, 'run');
      const r = await runCli(['--models', 'gemma4:31b', '--suite', suite, '--warmups', '0', '--out', out], { OLLAMA_HOST: `http://127.0.0.1:${fake.port}` });
      const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
      const key = Object.keys(summary.hashes).find((k) => k.endsWith('suite.json'))!;
      expect(summary.hashes[key]).toBe(original);
      expect(summary.changedDuringRun).toEqual([key]);
      expect(r.status).toBe(1);
    } finally {
      await fake.close();
      rmSync(base, { recursive: true, force: true });
    }
  }, 30000);

  it('lets a suite file set the rule the rules baseline follows for "at bedtime as needed" (Grok 16)', () => {
    const base = mkdtempSync(join(tmpdir(), 'eval-r2-'));
    try {
      const line = 'Examplamine 3 mg tablet, take 1 tablet by mouth at bedtime as needed for sleep';
      const gold = { drug: 'examplamine', drug_match: 'examplamine', dose_per_administration: { value: 3, unit: 'mg' }, frequency: null, timing: 'bedtime', prn: true, prn_indication: 'sleep' };
      const file = join(base, 'suite.json');
      writeFileSync(file, JSON.stringify({ status: 'test fixture', conventions: { bedtimeAsNeeded: 'no-schedule' }, cases: [{ id: 'b1', input: line, gold }] }));
      const out = join(base, 'run');
      const r = spawnSync(process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/eval-sig.ts', '--', '--baselines-only', '--suite', file, '--out', out], { encoding: 'utf8', env: { PATH: process.env.PATH } });
      expect(r.status, r.stderr).toBe(0);
      const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
      expect(summary.conventions).toEqual({ rulesBaselineBedtimeAsNeeded: 'no-schedule' });
      expect(summary.results.find((x: { label: string }) => x.label === 'baseline: rules').counts.allCorrect).toBe(1);
      writeFileSync(file, JSON.stringify({ conventions: { bedtimeAsNeeded: 'sometimes' }, cases: [{ id: 'b1', input: line, gold }] }));
      const bad = spawnSync(process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/eval-sig.ts', '--', '--baselines-only', '--suite', file, '--out', join(base, 'bad')], { encoding: 'utf8', env: { PATH: process.env.PATH } });
      expect(bad.status).not.toBe(0);
      expect(bad.stderr).toMatch(/once-daily or no-schedule/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 30000);

  it('refuses a gold dose unit the scorer does not know before writing anything (Grok 5)', () => {
    const base = mkdtempSync(join(tmpdir(), 'eval-r2-'));
    try {
      const gold = { drug: 'examplamine', drug_match: 'examplamine', dose_per_administration: { value: 1, unit: 'tsp' }, frequency: 'once_daily', timing: null, prn: false, prn_indication: null };
      const file = join(base, 'suite.json');
      writeFileSync(file, JSON.stringify({ cases: [{ id: 'u1', input: 'Examplamine 1 tsp by mouth once daily', gold }] }));
      const out = join(base, 'run');
      const r = spawnSync(process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/eval-sig.ts', '--', '--baselines-only', '--suite', file, '--out', out], { encoding: 'utf8', env: { PATH: process.env.PATH } });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/Gold u1 has dose unit "tsp"/);
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 30000);

  it('hashes every source file the eval imports, including the mock endpoint (GPT 13)', () => {
    const base = mkdtempSync(join(tmpdir(), 'eval-r2-'));
    try {
      const out = join(base, 'run');
      const r = spawnSync(process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/eval-sig.ts', '--', '--baselines-only', '--out', out], { encoding: 'utf8', env: { PATH: process.env.PATH } });
      expect(r.status, r.stderr).toBe(0);
      const hashed = Object.keys(JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')).hashes);
      for (const f of ['src/engine/mockEndpoint.ts', 'src/engine/flowRunner.ts', 'src/engine/templateResolver.ts', 'src/eval/sigBaselines.ts', 'src/types/flow.ts']) expect(hashed, f).toContain(f);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 30000);
});
