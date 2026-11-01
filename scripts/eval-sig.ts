/**
 * Medication-instruction extraction eval.
 *
 * Runs every case in eval/sig-extraction/cases.jsonl through the app's own flow
 * engine (FlowRunner -> UnifiedModelAdapter) as a one-step flow, scores each
 * reply against gold.jsonl, and writes raw outputs plus a summary.
 *
 *   npm run eval:mock                  # mock baseline only, no Ollama needed
 *   npm run eval                       # mock + every model in models.json
 *   npm run eval -- --models gemma4:31b
 *   npm run eval -- --out eval/results/my-run
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import os from 'os';
import { scoreLegacy, LegacyGold } from '../src/eval/legacyScore'
import path from 'path';
import { FlowRunner } from '../src/engine/flowRunner';
import { Flow, ModelConfig } from '../src/types/flow';
import { scoreCase, summarize, percentile, SigGold, SigCaseScore, SIG_FIELDS } from '../src/eval/sigScore';

const ROOT = path.resolve(__dirname, '..');
const EVAL_DIR = path.join(ROOT, 'eval/sig-extraction');
const OLLAMA = process.env.OLLAMA_HOST?.replace(/\/$/, '') || 'http://localhost:11434';

interface Case {
  id: string;
  input: string;
  tags: string[];
}
interface ModelEntry {
  model: string;
  think?: ModelConfig['think'];
  note?: string;
}

const readJsonl = <T>(f: string, directory = EVAL_DIR): T[] =>
  readFileSync(path.join(directory, f), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as T);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const heldout = process.argv.includes('--heldout')
const legacy = process.argv.includes('--schema-v1')
const revisionDir = legacy ? path.join(ROOT, 'eval/results/archive/schema-v1') : EVAL_DIR
const frozen = heldout ? JSON.parse(readFileSync(path.join(ROOT, 'eval/heldout/frozen.json'), 'utf8')) : null
const cases: Case[] = frozen ? frozen.cases : readJsonl<Case>('cases.jsonl')
const golds: Array<SigGold | LegacyGold> = frozen
  ? frozen.cases.map((c: { v1: LegacyGold, v2: SigGold }) => legacy ? c.v1 : c.v2)
  : legacy ? readJsonl<LegacyGold>('gold.jsonl', revisionDir) : readJsonl<SigGold>('gold.jsonl')
const promptTemplate = readFileSync(path.join(revisionDir, 'prompt.txt'), 'utf8')
const schema = JSON.parse(readFileSync(path.join(revisionDir, 'schema.json'), 'utf8'))
const config = JSON.parse(readFileSync(path.join(EVAL_DIR, 'models.json'), 'utf8')) as {
  temperature: number;
  models: ModelEntry[];
};

const mockOnly = process.argv.includes('--mock-only');
const modelFilter = arg('--models')?.split(',');
const today = new Date().toISOString().slice(0, 10);
const outDir = path.resolve(ROOT, arg('--out') ?? `eval/results/${today}`);
mkdirSync(outDir, { recursive: true });

const runner = new FlowRunner();

function oneStepFlow(input: string, modelConfig: ModelConfig): Flow {
  return {
    id: 'sig-eval',
    name: 'Sig extraction',
    initialInput: input,
    steps: [{ id: 'extract', name: 'extract', prompt: promptTemplate, modelConfig, status: 'idle', output: '' }],
  };
}

async function runOne(input: string, modelConfig: ModelConfig) {
  const res = await runner.runFlow(oneStepFlow(input, modelConfig));
  const step = res.flow.steps[0];
  return { text: step.output ?? '', latencyMs: step.latencyMs ?? null, error: step.error ?? null };
}

async function ollamaJson(route: string, body?: unknown): Promise<any> {
  const r = await fetch(`${OLLAMA}${route}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${route} -> HTTP ${r.status}`);
  return r.json();
}

interface RunSummary {
  label: string;
  provider: string;
  model: string;
  think?: ModelConfig['think'];
  details?: Record<string, unknown>;
  counts: ReturnType<typeof summarize>;
  latencyMs: { p50: number | null; p95: number | null; mean: number | null } | null;
  errors: number;
  loadAvg1m: { start: number; end: number };
}

async function evaluate(label: string, modelConfig: ModelConfig, details?: Record<string, unknown>): Promise<RunSummary> {
  const scores: SigCaseScore[] = [];
  const latencies: number[] = [];
  const lines: string[] = [];
  let errors = 0;
  const loadStart = os.loadavg()[0];
  for (const c of cases) {
    const gold = golds.find((g) => g.id === c.id)!;
    const r = await runOne(c.input, modelConfig);
    if (r.error) errors++;
    const s = legacy ? scoreLegacy(gold as LegacyGold, r.text) : scoreCase(gold as SigGold, r.text)
    scores.push(s);
    if (r.latencyMs !== null && !r.error) latencies.push(r.latencyMs);
    lines.push(JSON.stringify({ id: c.id, input: c.input, tags: c.tags, gold, output: r.text, error: r.error, latencyMs: r.latencyMs, score: s }));
    process.stdout.write(`${label} ${c.id} ${s.allCorrect ? 'ok ' : 'MISS'} ${r.latencyMs ?? '-'}ms\n`);
  }
  const slug = label.replace(/[^a-zA-Z0-9.-]+/g, '_');
  writeFileSync(path.join(outDir, `raw-${slug}.jsonl`), lines.join('\n') + '\n');
  const isMock = modelConfig.provider === 'mock';
  const loadEnd = os.loadavg()[0];
  return {
    label,
    provider: modelConfig.provider,
    model: modelConfig.model,
    think: modelConfig.think,
    details,
    counts: summarize(scores),
    latencyMs: isMock
      ? null
      : {
          p50: percentile(latencies, 50),
          p95: percentile(latencies, 95),
          mean: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
        },
    errors,
    // 1-minute load average at the start and end of this model's cases, so contention is on the record.
    loadAvg1m: { start: Number(loadStart.toFixed(1)), end: Number(loadEnd.toFixed(1)) },
  };
}

async function main() {
  const results: RunSummary[] = [];

  // Deterministic mock baseline: the app's default echo adapter. It scores 0 by design;
  // it proves the harness runs end to end and that the scorer gives no credit to an echo.
  results.push(
    await evaluate('mock (echo)', { provider: 'mock', model: 'mock-default', mockPattern: 'echo', mockLatencyMs: 0 })
  );

  let ollamaVersion: string | null = null;
  if (!mockOnly) {
    ollamaVersion = (await ollamaJson('/api/version')).version;
    const entries = config.models.filter((m) => !modelFilter || modelFilter.includes(m.model));
    for (const m of entries) {
      const show = await ollamaJson('/api/show', { model: m.model });
      const details = {
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
      };
      const residentBefore: string[] = ((await ollamaJson('/api/ps')).models ?? []).map((x: { name: string }) => x.name);
      // Untimed warm-up on a line that is not in the case set, so model load time is excluded.
      await runOne('Examplamine 10 mg tablet, take 1 tablet by mouth once daily', modelConfig);
      const residentDuring: string[] = ((await ollamaJson('/api/ps')).models ?? []).map((x: { name: string }) => x.name);
      results.push(await evaluate(m.model, { ...modelConfig }, { ...details, otherModelsResident: residentDuring.filter((n) => n !== m.model) }));
      // Unload before the next model so runs do not share memory, unless something else had it loaded first.
      if (!residentBefore.includes(m.model)) {
        await ollamaJson('/api/generate', { model: m.model, keep_alive: 0 }).catch(() => undefined);
      }
    }
  }

  const hardware = {
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cores: os.cpus().length,
    memoryGB: Math.round(os.totalmem() / 2 ** 30),
    platform: `${os.platform()} ${os.release()}`,
    node: process.version,
    ollama: ollamaVersion,
  };
  const summary = { dataset: heldout ? 'heldout-seed-20261031' : 'original-25', schema: legacy ? 'v1' : 'v2', date: today, n: cases.length, temperature: config.temperature, hardware, results };
  writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

  const FIELD_HEADERS = legacy ? ['Drug', 'Dose', 'Frequency'] : ['Drug', 'Dose', 'Frequency', 'Timing', 'PRN', 'PRN indication'];
  const pct = (k: number, n: number) => `${k}/${n} (${Math.round((100 * k) / n)}%)`;
  const md = [
    `Run ${today} on ${hardware.cpu}, ${hardware.memoryGB} GB, Ollama ${ollamaVersion ?? 'n/a'}. n=${cases.length}, temperature ${config.temperature}.`,
    '',
    `| Model | Settings | All fields | ${FIELD_HEADERS.join(' | ')} | Valid JSON | p50 latency | p95 latency | Load avg (1m) start/end |`,
    `|${'---|'.repeat(FIELD_HEADERS.length + 7)}`,
    ...results.map((r) => {
      const c = r.counts;
      const settings = r.provider === 'mock' ? 'echo, no model' : `${r.details?.parameter_size}, ${r.details?.quantization_level}, think=${JSON.stringify(r.think)}`;
      const lat = r.latencyMs ? [`${((r.latencyMs.p50 ?? 0) / 1000).toFixed(2)} s`, `${((r.latencyMs.p95 ?? 0) / 1000).toFixed(2)} s`] : ['n/a', 'n/a'];
      const fields = (legacy ? SIG_FIELDS.slice(0, 3) : SIG_FIELDS).map((k) => pct(c[k], c.n)).join(' | ');
      return `| ${r.label} | ${settings} | ${pct(c.allCorrect, c.n)} | ${fields} | ${pct(c.parsed, c.n)} | ${lat[0]} | ${lat[1]} | ${r.loadAvg1m.start} / ${r.loadAvg1m.end} |`;
    }),
    '',
  ].join('\n');
  writeFileSync(path.join(outDir, 'summary.md'), md);
  process.stdout.write('\n' + md);
}

main().catch((err) => {
  process.stderr.write(`eval failed: ${(err as Error).message}\n`);
  process.exit(1);
});
