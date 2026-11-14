/**
 * Runs one model on sig bench v2 and appends its raw replies. Scoring is a separate step
 * (scripts/sig-bench-v2-report.ts), so a run can stop and resume without losing anything.
 *
 *   npm run bench:sig:v2:run -- --source ollama:gemma4:31b --subset reviewed
 *   npm run bench:sig:v2:run -- --source claude:claude-opus-5-5 --subset proposed
 *
 * Every source gets the same prompt (bench/sig-bench/prompt-v2/system.txt and user.txt) and sees
 * only the e-prescription fields: drug, strength, dosage form, sig, quantity and days supply.
 *
 * - ollama:<model> goes through the app's own FlowRunner and Ollama adapter, the same path as
 *   scripts/eval-sig.ts, at temperature 0 under a JSON schema derived from schema-v2.json. The think
 *   setting comes from eval/sig-extraction/models.json when the model is listed there.
 * - claude:<model> calls the `claude` command-line tool in print mode with a clean environment, so it
 *   runs on the signed-in Claude subscription. No API key is passed, and the run refuses to start
 *   when the tool does not report a claude.ai sign-in. It runs with no tools and without user or
 *   project settings, memory or hooks.
 *
 * One request at a time. Before each request the one-minute load average is read, and the run waits
 * while it is above --max-load. Each request has a deadline (--timeout-ms, default 120000). Rows go
 * to bench/sig-bench/results/models-v2/raw-<source>.jsonl as soon as they finish. Ids already in
 * that file are skipped, so rerunning the same command resumes.
 */
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { FlowRunner } from '../src/engine/flowRunner';
import type { Flow, ModelConfig } from '../src/types/flow';
import { parseItemsV2, renderPrescription } from '../src/eval/sigBenchV2';
import type { V2Item } from '../src/eval/sigBenchV2Score';
import { ollamaBaseUrl, sha256File } from '../src/eval/harness';
import { modelReplySchema } from '../src/eval/sigBenchV2Report';

const ROOT = path.resolve(__dirname, '..');
const BENCH = path.join(ROOT, 'bench/sig-bench');
const SYSTEM_FILE = path.join(BENCH, 'prompt-v2/system.txt');
const USER_FILE = path.join(BENCH, 'prompt-v2/user.txt');
const OLLAMA = ollamaBaseUrl(process.env.OLLAMA_HOST);

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(name);
  const v = i === -1 ? undefined : process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${name} needs a value`);
  }
  return v;
}

const source = arg('--source');
const subset = arg('--subset', 'all');
const timeoutMs = Number(arg('--timeout-ms', '120000'));
const maxLoad = Number(arg('--max-load', '150'));
const numCtx = Number(arg('--num-ctx', '8192'));
const limit = Number(arg('--limit', '0'));
const OUT = path.resolve(ROOT, arg('--out', 'bench/sig-bench/results/models-v2'));
if (!['reviewed', 'proposed', 'all'].includes(subset)) throw new Error('--subset must be reviewed, proposed or all');
const [provider, ...rest] = source.split(':');
const model = rest.join(':');
if (!['ollama', 'claude'].includes(provider) || !model) throw new Error('--source must be ollama:<model> or claude:<model>');

const slugOf = (s: string) => s.replace(/[^a-zA-Z0-9.-]+/g, '_');
const rawFile = path.join(OUT, `raw-${slugOf(source)}.jsonl`);
const runsFile = path.join(OUT, 'runs.jsonl');

// ─── Inputs ───────────────────────────────────────────────────────────────────

const items = parseItemsV2(readFileSync(path.join(BENCH, 'items-v2.jsonl'), 'utf8')).filter(
  (i) => subset === 'all' || (subset === 'reviewed' ? i.label_status !== 'proposed' : i.label_status === 'proposed'),
);
const system = readFileSync(SYSTEM_FILE, 'utf8').trim();
const userTemplate = readFileSync(USER_FILE, 'utf8');
const userPrompt = (it: V2Item) => userTemplate.replace('{{input}}', renderPrescription(it.input));
const schema = modelReplySchema(JSON.parse(readFileSync(path.join(BENCH, 'schema-v2.json'), 'utf8')));

const done = new Set<string>();
if (existsSync(rawFile)) {
  for (const line of readFileSync(rawFile, 'utf8').split('\n')) if (line.trim()) done.add((JSON.parse(line) as { id: string }).id);
}
let todo = items.filter((i) => !done.has(i.id));
if (limit > 0) todo = todo.slice(0, limit);

const load1 = () => Math.round(os.loadavg()[0] * 10) / 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitForLoad(): Promise<number> {
  for (;;) {
    const l = load1();
    if (l <= maxLoad) return l;
    process.stdout.write(`load ${l} is above ${maxLoad}, waiting 60 s\n`);
    await sleep(60_000);
  }
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

const runner = new FlowRunner();
let think: ModelConfig['think'];
try {
  const cfg = JSON.parse(readFileSync(path.join(ROOT, 'eval/sig-extraction/models.json'), 'utf8')) as { models: Array<{ model: string; think?: ModelConfig['think'] }> };
  think = cfg.models.find((m) => m.model === model)?.think;
} catch {
  think = undefined;
}
const ollamaConfig: ModelConfig = {
  provider: 'ollama',
  model,
  temperature: 0,
  format: schema,
  think,
  systemPrompt: system,
  numCtx,
  endpointUrl: `${OLLAMA}/api/generate`,
  timeoutMs,
};

interface Reply {
  text: string;
  error: string | null;
  wallMs: number;
  meta: Record<string, unknown> | null;
}

async function askOllama(prompt: string): Promise<Reply> {
  const flow: Flow = {
    id: 'sig-bench-v2',
    name: 'Sig bench v2',
    initialInput: prompt,
    steps: [{ id: 'verify', name: 'verify', prompt: '{{input}}', modelConfig: ollamaConfig, status: 'idle', output: '' }],
  };
  const started = performance.now();
  const res = await runner.runFlow(flow, { strictPlaceholders: true });
  const wallMs = Math.round(performance.now() - started);
  const step = res.flow.steps[0];
  return { text: step.output ?? '', error: step.error ?? null, wallMs, meta: (res.state.stepResults[step.id]?.meta as Record<string, unknown>) ?? null };
}

// ─── claude CLI on the subscription ──────────────────────────────────────────

const claudeCwd = provider === 'claude' ? mkdtempSync(path.join(os.tmpdir(), 'sig-bench-claude-')) : '';
const cleanEnv = { HOME: os.homedir(), PATH: process.env.PATH ?? '', USER: os.userInfo().username, TERM: 'dumb' };

function claudeAuth(): Record<string, unknown> {
  const text = execFileSync('claude', ['auth', 'status'], { env: cleanEnv, cwd: claudeCwd, encoding: 'utf8' });
  return JSON.parse(text) as Record<string, unknown>;
}

function askClaude(prompt: string): Promise<Reply> {
  const args = ['-p', '--model', model, '--safe-mode', '--setting-sources', '', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--output-format', 'json', '--system-prompt', system];
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn('claude', args, { env: cleanEnv, cwd: claudeCwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      const wallMs = Math.round(performance.now() - started);
      if (timedOut) return resolve({ text: '', error: `timed out after ${timeoutMs} ms`, wallMs, meta: null });
      try {
        const j = JSON.parse(out) as Record<string, unknown>;
        const usage = (j.usage ?? {}) as Record<string, unknown>;
        const meta = { models: Object.keys((j.modelUsage ?? {}) as object), input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, duration_api_ms: j.duration_api_ms, exit: code };
        if (j.is_error) return resolve({ text: String(j.result ?? ''), error: `claude reported an error: ${String(j.result ?? j.subtype)}`, wallMs, meta });
        resolve({ text: String(j.result ?? ''), error: null, wallMs, meta });
      } catch {
        resolve({ text: out, error: `claude exited ${code}: ${err.trim().slice(0, 300) || 'output was not JSON'}`, wallMs, meta: null });
      }
    });
    child.stdin.end(prompt);
  });
}

// ─── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT, { recursive: true });
  const startLoad = load1();
  process.stdout.write(`${source}: ${items.length} items in subset ${subset}, ${done.size} already done, ${todo.length} to run. load ${startLoad}\n`);
  let details: Record<string, unknown> = {};
  if (provider === 'ollama') {
    const tags = (await (await fetch(`${OLLAMA}/api/tags`)).json()) as { models: Array<{ name: string; digest: string; size: number }> };
    const tag = tags.models.find((t) => t.name === model);
    if (!tag) throw new Error(`${model} is not installed in this Ollama`);
    const version = ((await (await fetch(`${OLLAMA}/api/version`)).json()) as { version: string }).version;
    details = { ollama: version, digest: tag.digest, sizeBytes: tag.size, think: think ?? null, temperature: 0, numCtx, format: 'JSON schema from schema-v2.json (constrained decoding)' };
  } else {
    const auth = claudeAuth();
    if (auth.authMethod !== 'claude.ai' || !auth.loggedIn) throw new Error(`claude is not signed in to a Claude subscription (authMethod ${String(auth.authMethod)}). Refusing to run.`);
    details = { authMethod: auth.authMethod, subscriptionType: auth.subscriptionType, cli: execFileSync('claude', ['--version'], { env: cleanEnv, encoding: 'utf8' }).trim(), format: 'prompt only, no decoding constraint' };
  }
  const startedAt = new Date().toISOString();
  let n = 0;
  for (const it of todo) {
    const load = await waitForLoad();
    const prompt = userPrompt(it);
    const r = provider === 'ollama' ? await askOllama(prompt) : await askClaude(prompt);
    n++;
    appendFileSync(rawFile, `${JSON.stringify({ id: it.id, label_status: it.label_status, source, output: r.text, error: r.error, wallMs: r.wallMs, load1m: load, meta: r.meta, at: new Date().toISOString() })}\n`);
    process.stdout.write(`${source} ${n}/${todo.length} ${it.id} ${(r.wallMs / 1000).toFixed(1)} s load ${load}${r.error ? ` ERROR ${r.error}` : ''}\n`);
  }
  let commit: string | null = null;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    commit = null;
  }
  appendFileSync(
    runsFile,
    `${JSON.stringify({ source, subset, ran: n, startedAt, finishedAt: new Date().toISOString(), gitCommit: commit, timeoutMs, maxLoad, startLoad, endLoad: load1(), promptSha256: { system: sha256File(SYSTEM_FILE), user: sha256File(USER_FILE) }, hardware: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 2 ** 30) }, details })}\n`,
  );
  if (provider === 'ollama') await fetch(`${OLLAMA}/api/generate`, { method: 'POST', body: JSON.stringify({ model, keep_alive: 0 }) }).catch(() => undefined);
}

main().catch((err) => {
  process.stderr.write(`sig bench v2 run failed: ${(err as Error).message}\n`);
  process.exit(1);
});
