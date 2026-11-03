/**
 * Helpers for the eval CLI (scripts/eval-sig.ts). Pure functions where possible, so the rules
 * that protect the evidence are unit tested: output folders are never reused, case and model
 * order can be randomized from a recorded seed, intervals are exact, and latency counts every
 * request, including failures and the first request after warm-up.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const SUITE_NAMES = ['dev25', 'templates12'] as const;
export type SuiteName = (typeof SUITE_NAMES)[number];

/** What each built-in set is. Both are development data: see eval/sig-extraction/README.md. */
export const SUITE_STATUS: Record<SuiteName, string> = {
  dev25: 'development data: the 25 lines the split format, prompt and labels were revised on',
  templates12: 'development data: six templates taken from the 25 development lines, each filled in twice',
};

export interface EvalOptions {
  help: boolean;
  suite: string;
  format: 'split' | 'first';
  scorer: 'v3' | 'v2';
  out?: string;
  models?: string[];
  baselinesOnly: boolean;
  order: 'random' | 'fixed';
  seed: number;
  warmups: number;
  timeoutMs: number;
  budgetMs: number;
  allowRemote: boolean;
  notes: string[];
}

export const USAGE = `Usage: npm run eval -- [options]

Runs each line of a suite through the app's FlowRunner, scores every reply, and writes raw
replies, a summary.json and a summary.md into a new folder.

  --suite <name|file>   dev25 (default), templates12, or a JSON file {"cases":[{id,input,gold}]}
  --heldout             same as --suite templates12 (kept for old commands; it is development data)
  --schema-v1           use the archived first format (prompt, schema, labels and v1 scoring)
  --scorer v3|v2        split-format scorer. v3 (default) or the historical v2 scorer
  --models a,b          only these models from eval/sig-extraction/models.json
  --baselines-only      echo, rules, constant and copy baselines only. No Ollama needed
  --mock-only           same as --baselines-only
  --out <dir>           output folder. It must not exist yet
  --order random|fixed  case and model order (default random)
  --seed <n>            seed for the random order (default 20261103)
  --warmups <n>         untimed warm-up requests per model (default 2)
  --timeout-ms <n>      per-request deadline (default 60000)
  --budget-ms <n>       latency budget to count requests against (default 10000)
  --allow-remote        allow OLLAMA_HOST to point at another machine
  --help                print this text
`;

function value(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value`);
  return v;
}

function positiveInt(raw: string | undefined, name: string, fallback: number, allowZero = false): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < (allowZero ? 0 : 1)) throw new Error(`${name} must be a ${allowZero ? 'non-negative' : 'positive'} integer`);
  return n;
}

const KNOWN_FLAGS = new Set(['--suite', '--heldout', '--schema-v1', '--scorer', '--models', '--baselines-only', '--mock-only', '--out', '--order', '--seed', '--warmups', '--timeout-ms', '--budget-ms', '--allow-remote', '--help', '-h']);
const FLAGS_WITH_VALUES = new Set(['--suite', '--scorer', '--models', '--out', '--order', '--seed', '--warmups', '--timeout-ms', '--budget-ms']);

export function parseEvalArgs(argv: string[]): EvalOptions {
  const args = argv.filter((a) => a !== '--');
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-')) continue;
    if (!KNOWN_FLAGS.has(a)) throw new Error(`Unknown option ${a}. Run with --help.`);
    if (FLAGS_WITH_VALUES.has(a)) i++;
  }
  const notes: string[] = [];
  let suite = value(args, '--suite') ?? 'dev25';
  if (args.includes('--heldout')) {
    suite = 'templates12';
    notes.push('The 12 template lines are development data. Their six patterns were taken from the 25 development lines.');
  }
  const scorer = value(args, '--scorer') ?? 'v3';
  if (scorer !== 'v3' && scorer !== 'v2') throw new Error('--scorer must be v3 or v2');
  const order = value(args, '--order') ?? 'random';
  if (order !== 'random' && order !== 'fixed') throw new Error('--order must be random or fixed');
  const models = value(args, '--models')?.split(',').map((m) => m.trim()).filter(Boolean);
  return {
    help: args.includes('--help') || args.includes('-h'),
    suite,
    format: args.includes('--schema-v1') ? 'first' : 'split',
    scorer,
    out: value(args, '--out'),
    models,
    baselinesOnly: args.includes('--baselines-only') || args.includes('--mock-only'),
    order,
    seed: positiveInt(value(args, '--seed'), '--seed', 20261103, true),
    warmups: positiveInt(value(args, '--warmups'), '--warmups', 2, true),
    timeoutMs: positiveInt(value(args, '--timeout-ms'), '--timeout-ms', 60000),
    budgetMs: positiveInt(value(args, '--budget-ms'), '--budget-ms', 10000),
    allowRemote: args.includes('--allow-remote'),
    notes,
  };
}

/** Committed results are evidence. A run never writes into a folder that already exists. */
export function assertNewOutputDir(dir: string): void {
  if (existsSync(dir)) {
    throw new Error(`Output folder ${dir} already exists. Choose a new --out folder. Existing results are never overwritten.`);
  }
}

/** Deterministic shuffle (Fisher-Yates with a linear congruential generator). */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function binomialCdf(k: number, n: number, p: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  let term = Math.pow(1 - p, n);
  let sum = term;
  for (let i = 1; i <= k; i++) {
    term *= ((n - i + 1) / i) * (p / (1 - p));
    sum += term;
  }
  return Math.min(1, sum);
}

/** Exact (Clopper-Pearson) two-sided interval for k successes in n, as proportions. */
export function exactInterval(k: number, n: number, confidence = 0.95): [number, number] {
  if (n <= 0) return [0, 1];
  const alpha = (1 - confidence) / 2;
  const solve = (f: (p: number) => boolean) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid)) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const lower = k === 0 ? 0 : solve((p) => 1 - binomialCdf(k - 1, n, p) < alpha);
  const upper = k === n ? 1 : solve((p) => binomialCdf(k, n, p) > alpha);
  return [lower, upper];
}

export const formatInterval = ([lo, hi]: [number, number]) => `${(lo * 100).toFixed(1)} to ${(hi * 100).toFixed(1)}%`;

/** Nearest-rank percentile, or null for no values. */
export function nearestRank(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length))) - 1];
}

export interface TimedRequest {
  /** Wall-clock milliseconds, measured for failures too. */
  ms: number;
  error: boolean;
  /** 1 for the first timed request after warm-up. */
  position: number;
}

export interface LatencySummary {
  requests: number;
  errors: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
  /** True when p95 is just the slowest request, which is the case for fewer than 20 requests. */
  p95IsMax: boolean;
  firstRequestMs: number | null;
  p95WithoutFirst: number | null;
  withinBudget: number;
  budgetMs: number;
}

/** Latency over every request. Failures count at the time they took, and against the budget. */
export function latencySummary(requests: TimedRequest[], budgetMs: number): LatencySummary {
  const all = requests.map((r) => r.ms);
  const first = requests.find((r) => r.position === 1);
  const rest = requests.filter((r) => r.position !== 1).map((r) => r.ms);
  return {
    requests: requests.length,
    errors: requests.filter((r) => r.error).length,
    p50: nearestRank(all, 50),
    p95: nearestRank(all, 95),
    max: all.length ? Math.max(...all) : null,
    p95IsMax: all.length > 0 && all.length < 20,
    firstRequestMs: first ? first.ms : null,
    p95WithoutFirst: nearestRank(rest, 95),
    withinBudget: requests.filter((r) => !r.error && r.ms <= budgetMs).length,
    budgetMs,
  };
}

export const sha256 = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
export const sha256File = (path: string) => sha256(readFileSync(path));

/** min, median and max of load samples. */
export function loadSummary(samples: number[]): { samples: number; min: number | null; median: number | null; max: number | null } {
  if (samples.length === 0) return { samples: 0, min: null, median: null, max: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const round = (x: number) => Math.round(x * 10) / 10;
  return { samples: samples.length, min: round(sorted[0]), median: round(sorted[Math.floor(sorted.length / 2)]), max: round(sorted[sorted.length - 1]) };
}

/**
 * OLLAMA_HOST read the way Ollama reads it: "127.0.0.1:11434", "localhost" and "http://host:port"
 * all work. A value without a scheme gets http and, without a port, Ollama's port 11434. Unset
 * means http://localhost:11434.
 */
export function ollamaBaseUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  if (!value) return 'http://localhost:11434';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  const hasPort = /^\[[^\]]+\]:\d+$/.test(value) || /^[^:[\]]+:\d+$/.test(value);
  return `http://${hasPort ? value : `${value}:11434`}`;
}

/**
 * The models to run, in models.json order. Every name in --models must be in models.json, so a
 * typo stops the run before anything is written instead of running no model at all.
 */
export function selectModels<T extends { model: string }>(configured: T[], requested: string[] | undefined): T[] {
  if (configured.length === 0) throw new Error('eval/sig-extraction/models.json lists no models');
  if (!requested) return configured;
  const unknown = requested.filter((name) => !configured.some((m) => m.model === name));
  if (unknown.length) throw new Error(`--models names ${unknown.join(', ')}, which ${unknown.length === 1 ? 'is' : 'are'} not in eval/sig-extraction/models.json (${configured.map((m) => m.model).join(', ')})`);
  return configured.filter((m) => requested.includes(m.model));
}

const IMPORT_SPECIFIER = /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*\(?\s*['"]([^'"]+)['"]/g;

/**
 * Every source file that `entry` loads through relative imports, itself included, as paths
 * relative to `root`, sorted. The eval hashes all of them, so a summary names the exact code that
 * produced it.
 */
export function importClosure(entry: string, root: string): string[] {
  const seen = new Set<string>();
  const resolve = (from: string, spec: string): string | null => {
    const base = path.resolve(path.dirname(from), spec);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, path.join(base, 'index.ts')]) {
      if (existsSync(candidate) && !candidate.endsWith(path.sep) && /\.(?:ts|tsx|js|mjs)$/.test(candidate)) return candidate;
    }
    return null;
  };
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const m of readFileSync(file, 'utf8').matchAll(IMPORT_SPECIFIER)) {
      const spec = m[1] ?? m[2];
      if (!spec || !spec.startsWith('.')) continue;
      const target = resolve(file, spec);
      if (target) visit(target);
    }
  };
  visit(path.resolve(root, entry));
  return [...seen].map((f) => path.relative(root, f)).sort();
}
