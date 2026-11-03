/**
 * Medication-instruction extraction eval.
 *
 * Runs every line of a suite through the app's own flow engine (FlowRunner -> adapter) as a
 * one-step flow, scores each reply, and writes raw replies plus a summary into a new folder.
 * Run with --help for the options.
 *
 *   npm run eval:mock                                  # baselines only, no Ollama needed
 *   npm run eval -- --out eval/results/my-run          # baselines + every model in models.json
 *   npm run eval -- --suite templates12 --models gemma4:31b --out eval/results/my-run
 *
 * Both built-in suites are development data. A headline number needs a fresh locked set
 * (docs/FRESH-TEST-PROTOCOL.md), passed with --suite <file>.
 *
 * Evidence rules: every input and every source file the eval imports is hashed before the first
 * request and checked again at the end. Each reply is appended to its raw file as soon as it is
 * scored. A run that stops partway still writes a summary.json, marked incomplete.
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FlowRunner } from '../src/engine/flowRunner';
import { isLoopbackUrl } from '../src/engine/modelAdapter';
import { Flow, ModelConfig } from '../src/types/flow';
import { SIG_FIELDS, SigGold, scoreCase, summarize } from '../src/eval/sigScore';
import { scoreLegacy, LegacyGold } from '../src/eval/legacyScore';
import { SCORER_VERSION, scoreCaseV3, summarizeV3, normalizeUnitV3 } from '../src/eval/sigScoreV3';
import { BASELINES, runBaseline, RulesOptions } from '../src/eval/sigBaselines';
import {
  parseEvalArgs, USAGE, SUITE_NAMES, SUITE_STATUS, SuiteName, assertNewOutputDir, seededShuffle,
  exactInterval, formatInterval, latencySummary, loadSummary, sha256File, TimedRequest,
  ollamaBaseUrl, selectModels, importClosure,
} from '../src/eval/harness';

const ROOT = path.resolve(__dirname, '..');
const rel = (p: string) => {
  const r = path.relative(ROOT, p);
  return r.startsWith('..') ? p : r || '.';
};
const EVAL_DIR = path.join(ROOT, 'eval/sig-extraction');
const V1_DIR = path.join(ROOT, 'eval/results/archive/schema-v1');
const OLLAMA = ollamaBaseUrl(process.env.OLLAMA_HOST);
const WARMUP_LINE = 'Examplamine 10 mg tablet, take 1 tablet by mouth once daily';

let opts: ReturnType<typeof parseEvalArgs>;
try {
  opts = parseEvalArgs(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`${(err as Error).message}\n\n${USAGE}`);
  process.exit(2);
}
if (opts.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}
for (const note of opts.notes) process.stderr.write(`Note: ${note}\n`);

interface Case { id: string; input: string; tags?: string[] }
type AnyGold = SigGold | LegacyGold;

const readJsonl = <T>(file: string): T[] => readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as T);

// ---------- suite ----------
const first = opts.format === 'first';
let suiteLabel: string;
let suiteStatus: string;
let suiteFiles: string[];
let cases: Case[];
let golds: AnyGold[];
// The rule the rules baseline follows for "at bedtime as needed". The built-in gold uses once-daily.
let rulesOptions: Required<RulesOptions> = { bedtimeAsNeeded: 'once-daily' };
if ((SUITE_NAMES as readonly string[]).includes(opts.suite)) {
  const name = opts.suite as SuiteName;
  suiteLabel = name;
  suiteStatus = SUITE_STATUS[name];
  if (name === 'dev25') {
    const goldFile = first ? path.join(V1_DIR, 'gold.jsonl') : path.join(EVAL_DIR, 'gold.jsonl');
    suiteFiles = [path.join(EVAL_DIR, 'cases.jsonl'), goldFile];
    cases = readJsonl<Case>(suiteFiles[0]);
    golds = readJsonl<AnyGold>(goldFile);
  } else {
    const file = path.join(ROOT, 'eval/heldout/frozen.json');
    suiteFiles = [file];
    const frozen = JSON.parse(readFileSync(file, 'utf8'));
    cases = frozen.cases;
    golds = frozen.cases.map((c: { v1: LegacyGold; v2: SigGold }) => (first ? c.v1 : c.v2));
  }
} else {
  if (first) throw new Error('--schema-v1 works with the built-in suites only');
  const file = path.resolve(ROOT, opts.suite);
  suiteFiles = [file];
  const suite = JSON.parse(readFileSync(file, 'utf8')) as { status?: string; conventions?: RulesOptions; cases: Array<Case & { gold: SigGold }> };
  suiteLabel = path.basename(file);
  suiteStatus = suite.status ?? 'status not stated in the suite file';
  const bedtime = suite.conventions?.bedtimeAsNeeded ?? 'once-daily';
  if (bedtime !== 'once-daily' && bedtime !== 'no-schedule') throw new Error('conventions.bedtimeAsNeeded must be once-daily or no-schedule');
  rulesOptions = { bedtimeAsNeeded: bedtime };
  cases = suite.cases.map(({ id, input, tags }) => ({ id, input, tags }));
  golds = suite.cases.map((c) => ({ ...c.gold, id: c.id }));
}
const goldById = new Map(golds.map((g) => [g.id, g]));
if (goldById.size !== golds.length) throw new Error('Two gold records share an id');
const ids = new Set(cases.map((c) => c.id));
if (ids.size !== cases.length) throw new Error('Two cases share an id');
for (const c of cases) if (!goldById.has(c.id)) throw new Error(`Case ${c.id} has no gold record`);
for (const g of golds) if (!ids.has(g.id)) throw new Error(`Gold ${g.id} has no case`);
if (!first) {
  // Scorer v3 refuses a gold unit it does not know. Say so now, before anything runs or is written.
  for (const g of golds as SigGold[]) {
    if (normalizeUnitV3(g.dose_per_administration?.unit) === null) throw new Error(`Gold ${g.id} has dose unit ${JSON.stringify(g.dose_per_administration?.unit)}. Use mg, mcg, g, units or mL.`);
  }
}

const formatDir = first ? V1_DIR : EVAL_DIR;
const promptFile = path.join(formatDir, 'prompt.txt');
const schemaFile = path.join(formatDir, 'schema.json');
const promptTemplate = readFileSync(promptFile, 'utf8');
const schema = JSON.parse(readFileSync(schemaFile, 'utf8'));
const config = JSON.parse(readFileSync(path.join(EVAL_DIR, 'models.json'), 'utf8')) as {
  temperature: number;
  models: Array<{ model: string; think?: ModelConfig['think'] }>;
};
const scorerName = first ? 'v1 projection (src/eval/legacyScore.ts)' : opts.scorer === 'v3' ? `${SCORER_VERSION} (src/eval/sigScoreV3.ts)` : 'sig-v2 (src/eval/sigScore.ts)';

// A typo in --models stops here, before anything is written.
let modelEntries: typeof config.models = [];
try {
  if (opts.models || !opts.baselinesOnly) modelEntries = selectModels(config.models, opts.models);
} catch (err) {
  process.stderr.write(`eval failed: ${(err as Error).message}\n`);
  process.exit(2);
}

// ---------- provenance, taken before any request ----------
function gitCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
const sourceFiles = importClosure('scripts/eval-sig.ts', ROOT);
const hashedFiles = [...suiteFiles, promptFile, schemaFile, path.join(EVAL_DIR, 'models.json'), ...sourceFiles.map((f) => path.join(ROOT, f))];
const hashNow = (): Record<string, string> =>
  Object.fromEntries(hashedFiles.map((f) => {
    try {
      return [rel(f), sha256File(f)];
    } catch {
      return [rel(f), 'missing'];
    }
  }));
const startHashes = hashNow();
const startCommit = gitCommit();

// ---------- output ----------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(ROOT, opts.out ?? `eval/results/local-${stamp}-${suiteLabel.replace(/[^a-zA-Z0-9.-]+/g, '_')}${opts.baselinesOnly ? '-baselines' : ''}`);
try {
  assertNewOutputDir(outDir);
} catch (err) {
  process.stderr.write(`eval failed: ${(err as Error).message}\n`);
  process.exit(1);
}
// The folder is created only after the Ollama checks pass (see main), so a refused run leaves nothing.
const writeNew = (file: string, text: string) => writeFileSync(path.join(outDir, file), text, { flag: 'wx' });
const appendRow = (file: string, row: unknown) => appendFileSync(path.join(outDir, file), JSON.stringify(row) + '\n');

// ---------- scoring ----------
function score(gold: AnyGold, text: string, input: string) {
  if (first) return scoreLegacy(gold as LegacyGold, text);
  if (opts.scorer === 'v2') return scoreCase(gold as SigGold, text);
  return scoreCaseV3(gold as SigGold, text, input, schema);
}
function summarizeScores(scores: ReturnType<typeof score>[]) {
  if (first) {
    const s = summarize(scores as ReturnType<typeof scoreLegacy>[]);
    // The first format scored drug, dose and frequency only. Do not emit placeholder counts.
    return { n: s.n, parsed: s.parsed, drug: s.drug, dose: s.dose, frequency: s.frequency, allCorrect: s.allCorrect } as Record<string, number>;
  }
  return (opts.scorer === 'v2' ? summarize(scores as ReturnType<typeof scoreCase>[]) : summarizeV3(scores as ReturnType<typeof scoreCaseV3>[])) as unknown as Record<string, number>;
}
const scoredFields: string[] = first ? ['drug', 'dose', 'frequency'] : [...SIG_FIELDS];

// ---------- running ----------
const runner = new FlowRunner();
const oneStepFlow = (input: string, modelConfig: ModelConfig): Flow => ({
  id: 'sig-eval',
  name: 'Sig extraction',
  initialInput: input,
  steps: [{ id: 'extract', name: 'extract', prompt: promptTemplate, modelConfig, status: 'idle', output: '' }],
});

async function runOne(input: string, modelConfig: ModelConfig) {
  const started = performance.now();
  const res = await runner.runFlow(oneStepFlow(input, modelConfig), { strictPlaceholders: true });
  const wallMs = Math.round(performance.now() - started);
  const step = res.flow.steps[0];
  const meta = res.state.stepResults[step.id]?.meta ?? null;
  return { text: step.output ?? '', latencyMs: step.latencyMs ?? null, wallMs, error: step.error ?? null, meta };
}

async function ollamaJson(route: string, body?: unknown): Promise<any> {
  const r = await fetch(`${OLLAMA}${route}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs),
    redirect: 'error',
  });
  if (!r.ok) throw new Error(`${route} -> HTTP ${r.status}`);
  return r.json();
}

interface Row {
  id: string; input: string; tags?: string[]; gold: AnyGold; output: string; error: string | null;
  latencyMs: number | null; wallMs: number | null; position: number; meta?: Record<string, number> | null;
  unread?: string[]; score: ReturnType<typeof score>;
}

const slugOf = (label: string) => label.replace(/[^a-zA-Z0-9.-]+/g, '_');

function resultSummary(label: string, kind: 'baseline' | 'model', rows: Row[], extra: Record<string, unknown> = {}, timed: TimedRequest[] = []) {
  const counts = summarizeScores(rows.map((r) => r.score));
  const parseHow: Record<string, number> = {};
  for (const r of rows) {
    const how = (r.score as { parseHow?: string }).parseHow;
    if (how) parseHow[how] = (parseHow[how] ?? 0) + 1;
  }
  const [lo, hi] = exactInterval(counts.allCorrect, counts.n);
  return {
    label,
    kind,
    ...extra,
    counts,
    allCorrectInterval95: [Number(lo.toFixed(4)), Number(hi.toFixed(4))] as [number, number],
    parseHow: Object.keys(parseHow).length ? parseHow : undefined,
    unreadLines: rows.some((r) => r.unread) ? rows.filter((r) => (r.unread?.length ?? 0) > 0).map((r) => ({ id: r.id, unread: r.unread ?? [] })) : undefined,
    latency: timed.length ? latencySummary(timed, opts.budgetMs) : null,
    load1m: (extra.load1m as ReturnType<typeof loadSummary> | undefined) ?? null,
  };
}
type ResultSummary = ReturnType<typeof resultSummary>;

async function runBaselines(): Promise<ResultSummary[]> {
  const results: ResultSummary[] = [];
  // The app's default echo mock, run through the same FlowRunner as the models.
  const echoRows: Row[] = [];
  for (const [i, c] of cases.entries()) {
    const r = await runOne(c.input, { provider: 'mock', model: 'mock-default', mockPattern: 'echo', mockLatencyMs: 0 });
    const gold = goldById.get(c.id)!;
    echoRows.push({ id: c.id, input: c.input, tags: c.tags, gold, output: r.text, error: r.error, latencyMs: null, wallMs: null, position: i + 1, score: score(gold, r.text, c.input) });
  }
  writeNew(`raw-${slugOf('mock (echo)')}.jsonl`, echoRows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  results.push(resultSummary('mock (echo)', 'baseline', echoRows, { provider: 'mock', note: 'Echoes the prompt. The prompt holds no valid JSON object, so nothing is scored. It only shows that the harness runs.' }));

  const notes = {
    rules: `Deterministic parser in src/eval/sigBaselines.ts, written after its author read the 25 development and 12 template lines. Frozen before any later set exists, not tuned to one. Rule for "at bedtime as needed": ${rulesOptions.bedtimeAsNeeded}.`,
    constant: 'The same answer for every line.',
    copy: 'Copies the input line into every text field. Checks that copying earns no credit.',
  } as const;
  for (const name of BASELINES) {
    const rows: Row[] = cases.map((c, i) => {
      const r = runBaseline(name, c.input, rulesOptions);
      const gold = goldById.get(c.id)!;
      return { id: c.id, input: c.input, tags: c.tags, gold, output: r.text, error: null, latencyMs: null, wallMs: null, position: i + 1, unread: name === 'rules' ? r.unread : undefined, score: score(gold, r.text, c.input) };
    });
    writeNew(`raw-baseline_${name}.jsonl`, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    results.push(resultSummary(`baseline: ${name}`, 'baseline', rows, { provider: 'baseline', note: notes[name] }));
  }
  return results;
}

interface Preflight { version: string; tags: Array<{ name: string; digest?: string; size?: number }> }

/** Checks the host and that every selected model is installed, before the output folder exists. */
async function ollamaPreflight(): Promise<Preflight> {
  if (!isLoopbackUrl(OLLAMA) && !opts.allowRemote) throw new Error(`OLLAMA_HOST ${OLLAMA} is not this machine. Pass --allow-remote to send the eval lines there.`);
  const version = (await ollamaJson('/api/version')).version as string;
  const tags = ((await ollamaJson('/api/tags')).models ?? []) as Preflight['tags'];
  const missing = modelEntries.filter((m) => !tags.some((t) => t.name === m.model)).map((m) => m.model);
  if (missing.length) throw new Error(`not installed in this Ollama: ${missing.join(', ')}. Pull ${missing.length === 1 ? 'it' : 'them'} or leave ${missing.length === 1 ? 'it' : 'them'} out with --models.`);
  return { version, tags };
}

// What has finished so far. A run that stops partway reports exactly this.
const results: ResultSummary[] = [];
let inProgress: { model: string; rowsWritten: number } | null = null;

async function runModels({ tags }: Preflight): Promise<void> {
  const modelOrder = opts.order === 'random' ? seededShuffle(modelEntries, opts.seed) : modelEntries;
  for (const [modelIndex, m] of modelOrder.entries()) {
    const show = await ollamaJson('/api/show', { model: m.model });
    const tag = tags.find((t) => t.name === m.model);
    const details = {
      digest: tag?.digest ?? null,
      sizeBytes: tag?.size ?? null,
      parameter_size: show.details?.parameter_size,
      quantization_level: show.details?.quantization_level,
      family: show.details?.family,
    };
    const modelConfig: ModelConfig = {
      provider: 'ollama',
      model: m.model,
      temperature: config.temperature,
      format: schema,
      think: m.think,
      endpointUrl: `${OLLAMA}/api/generate`,
      timeoutMs: opts.timeoutMs,
      allowRemote: opts.allowRemote,
    };
    const residentBefore: string[] = ((await ollamaJson('/api/ps')).models ?? []).map((x: { name: string }) => x.name);
    // Untimed warm-ups on a line that is not in any suite. Their outcome is recorded, because a
    // failed warm-up means the first timed request may include loading the model. The first timed
    // request is reported on its own as well.
    const warmups: Array<{ ms: number; error: string | null }> = [];
    for (let w = 0; w < opts.warmups; w++) {
      const r = await runOne(WARMUP_LINE, modelConfig);
      warmups.push({ ms: r.latencyMs ?? r.wallMs, error: r.error });
      if (r.error) process.stderr.write(`Warning: warm-up ${w + 1} of ${opts.warmups} for ${m.model} failed: ${r.error}\n`);
    }
    const order = opts.order === 'random' ? seededShuffle(cases, opts.seed + modelIndex + 1) : cases;
    const loads: number[] = [os.loadavg()[0]];
    const sampler = setInterval(() => loads.push(os.loadavg()[0]), 1000);
    const rawFile = `raw-${slugOf(m.model)}.jsonl`;
    writeNew(rawFile, '');
    inProgress = { model: m.model, rowsWritten: 0 };
    const rows: Row[] = [];
    const timed: TimedRequest[] = [];
    try {
      for (const [i, c] of order.entries()) {
        const r = await runOne(c.input, modelConfig);
        const gold = goldById.get(c.id)!;
        const s = score(gold, r.text, c.input);
        const row: Row = { id: c.id, input: c.input, tags: c.tags, gold, output: r.text, error: r.error, latencyMs: r.latencyMs, wallMs: r.wallMs, position: i + 1, meta: r.meta, score: s };
        appendRow(rawFile, row);
        rows.push(row);
        inProgress.rowsWritten = rows.length;
        timed.push({ ms: r.latencyMs ?? r.wallMs, error: r.error !== null, position: i + 1 });
        process.stdout.write(`${m.model} ${c.id} ${s.allCorrect ? 'ok  ' : 'MISS'} ${r.latencyMs ?? r.wallMs}ms${r.error ? ` ${r.error}` : ''}\n`);
      }
    } finally {
      clearInterval(sampler);
      loads.push(os.loadavg()[0]);
    }
    results.push(resultSummary(m.model, 'model', rows, {
      provider: 'ollama',
      model: m.model,
      details,
      settings: { temperature: config.temperature, think: m.think ?? null, format: 'JSON schema (constrained decoding)', timeoutMs: opts.timeoutMs, warmups: opts.warmups },
      warmups,
      otherModelsResident: residentBefore.filter((name) => name !== m.model),
      load1m: loadSummary(loads),
    }, timed));
    inProgress = null;
    if (!residentBefore.includes(m.model)) await ollamaJson('/api/generate', { model: m.model, keep_alive: 0 }).catch(() => undefined);
  }
}

const startedAt = new Date().toISOString();
let ollamaVersion: string | null = null;
let finished = false;

/**
 * Writes summary.json and summary.md for whatever has finished. `stopped` is null for a complete
 * run, or the reason it stopped. Returns the inputs or source files whose bytes changed during the run.
 */
function finish(stopped: string | null): string[] {
  finished = true;
  const endHashes = hashNow();
  const changedDuringRun = Object.keys(startHashes).filter((f) => endHashes[f] !== startHashes[f]);
  const summary = {
    harness: 'eval-sig v3',
    complete: stopped === null,
    error: stopped,
    inProgress,
    suite: { name: suiteLabel, status: suiteStatus, n: cases.length },
    format: first ? 'first (v1: drug, dose, frequency)' : 'split (v2: drug, dose, frequency, timing, prn, prn_indication)',
    scorer: scorerName,
    conventions: { rulesBaselineBedtimeAsNeeded: rulesOptions.bedtimeAsNeeded },
    startedAt,
    finishedAt: new Date().toISOString(),
    gitCommit: startCommit,
    args: process.argv.slice(2),
    order: { mode: opts.order, seed: opts.seed },
    hashesTakenAt: 'before the first request',
    hashes: startHashes,
    changedDuringRun,
    hardware: { cpu: os.cpus()[0]?.model ?? 'unknown', cores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 2 ** 30), platform: `${os.platform()} ${os.release()}`, node: process.version, ollama: ollamaVersion },
    results,
  };
  writeNew('summary.json', JSON.stringify(summary, null, 2) + '\n');

  const n = cases.length;
  const ms = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : `${(v / 1000).toFixed(1)} s`);
  const lines = [
    `# ${suiteLabel}: ${suiteStatus}`,
    '',
    ...(stopped ? [`**Incomplete run.** It stopped: ${stopped}. Only the rows below finished.`, ''] : []),
    ...(changedDuringRun.length ? [`**Files changed during the run:** ${changedDuringRun.join(', ')}. The hashes are from before the first request.`, ''] : []),
    `Format: ${summary.format}. Scorer: ${scorerName}. ${n} lines. Started ${startedAt}.`,
    'Models answer under JSON-schema constrained decoding, so a parseable reply is guaranteed by the decoder, not earned by the model.',
    'Intervals are exact 95% binomial intervals for the all-fields count.',
    '',
    `| Row | All fields | 95% interval | ${scoredFields.join(' | ')} |`,
    `|${'---|'.repeat(scoredFields.length + 3)}`,
    ...results.map((r) => `| ${r.label} | ${r.counts.allCorrect}/${n} | ${formatInterval(r.allCorrectInterval95)} | ${scoredFields.map((f) => `${r.counts[f]}/${n}`).join(' | ')} |`),
    '',
  ];
  const timedRows = results.filter((r) => r.latency);
  if (timedRows.length) {
    lines.push(
      `Latency counts every request, failures included, against a ${opts.budgetMs / 1000} s budget. With fewer than 20 requests, p95 is simply the slowest request.`,
      '',
      '| Model | Requests | Errors | p50 | p95 | First request | p95 without first | Within budget | 1-min load (min to max) |',
      '|---|---|---|---|---|---|---|---|---|',
      ...timedRows.map((r) => `| ${r.label} | ${r.latency!.requests} | ${r.latency!.errors} | ${ms(r.latency!.p50)} | ${ms(r.latency!.p95)} | ${ms(r.latency!.firstRequestMs)} | ${ms(r.latency!.p95WithoutFirst)} | ${r.latency!.withinBudget}/${r.latency!.requests} | ${r.load1m?.min ?? 'n/a'} to ${r.load1m?.max ?? 'n/a'} |`),
      '',
    );
  }
  const rules = results.find((r) => r.label === 'baseline: rules');
  if (rules?.unreadLines?.length) {
    lines.push(`The rules parser could not read part of ${rules.unreadLines.length} of ${n} lines. Those parts are instructions the six fields cannot hold, so an all-fields match on those lines does not mean the whole instruction was kept:`, '');
    for (const u of rules.unreadLines) lines.push(`- ${u.id}: ${u.unread.join(' ')}`);
    lines.push('');
  }
  writeNew('summary.md', lines.join('\n'));
  process.stdout.write('\n' + lines.join('\n') + '\n');
  process.stdout.write(`Wrote ${rel(outDir)}\n`);
  return changedDuringRun;
}

// An interrupted run keeps the rows already on disk and says it is incomplete.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (!finished && existsSync(outDir)) {
      try {
        finish(`interrupted by ${signal}`);
      } catch {
        // The rows already on disk stay there.
      }
    }
    process.exit(130);
  });
}

async function main() {
  // Nothing is written until the host and the models check out.
  const preflight = opts.baselinesOnly ? null : await ollamaPreflight();
  if (preflight) ollamaVersion = preflight.version;
  mkdirSync(outDir, { recursive: true });
  let stopped: string | null = null;
  try {
    results.push(...(await runBaselines()));
    if (preflight) await runModels(preflight);
  } catch (err) {
    stopped = (err as Error).message;
  }
  const changed = finish(stopped);
  if (stopped) {
    process.stderr.write(`eval stopped: ${stopped}\nsummary.json is marked incomplete.\n`);
    process.exit(1);
  }
  if (changed.length) {
    process.stderr.write(`eval failed: these files changed during the run: ${changed.join(', ')}. The summary records the hashes from before the first request.\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`eval failed: ${(err as Error).message}\n`);
  process.exit(1);
});
