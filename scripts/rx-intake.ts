/**
 * Rx Intake Check: read, decide and score.
 *
 *   npm run rx -- extract --set dev --reader opus     # model readings, resumable
 *   npm run rx -- extract --set dev --reader qwen
 *   npm run rx -- score --set dev                     # rules layer on the readings, against the labels
 *   npm run rx -- freeze                              # hash the system into bench/rx-intake/system/FROZEN.json
 *
 * Sets: dev (bench/rx-intake/dev/dev-set.jsonl), proposed and reviewed (sig bench v2), heldout
 * (bench/rx-intake/heldout). The held-out set can be read only after the system is frozen, the
 * frozen hashes still match, and it is scored once.
 *
 * Readers: opus (claude CLI print mode on the Claude subscription) and qwen (qwen3.8:27b through
 * the app's Ollama path). One request at a time, 120 s each, paused while the load average is
 * above 150.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { FlowRunner } from '../src/engine/flowRunner';
import type { Flow, ModelConfig } from '../src/types/flow';
import { claudePrint, jsonFrom, assertSubscription } from '../src/rx/claudeCli';
import { factsFor } from '../src/rx/facts';
import { decide, type Decision, type Reading, type RxInput, type TierTable } from '../src/rx/rules';
import { parseTierTable } from '../src/eval/sigBenchV2';
import { combineDecisions, scoreSet, type GoldLine } from '../src/rx/score';

const ROOT = path.resolve(__dirname, '..');
const RX = path.join(ROOT, 'bench/rx-intake');
const SYS = path.join(RX, 'system');
const FACTS = path.join(SYS, 'facts.json');
const FROZEN = path.join(SYS, 'FROZEN.json');
const read = (p: string) => readFileSync(p, 'utf8');
const argv = process.argv.filter((a) => a !== '--').slice(2);
const cmd = argv[0];
const opt = (name: string, fallback?: string) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};

/** Files whose bytes define the system. FROZEN.json pins them. */
const SYSTEM_FILES = ['src/rx/rules.ts', 'src/rx/facts.ts', 'src/rx/nlm.ts', 'src/rx/claudeCli.ts', 'src/rx/score.ts', 'scripts/rx-intake.ts', 'bench/rx-intake/system/extract-system.txt', 'bench/rx-intake/system/extract-user.txt', 'bench/rx-intake/system/config.json', 'bench/sig-bench/CLARIFICATION-RULES.md'];
const sha = (f: string) => createHash('sha256').update(readFileSync(path.join(ROOT, f))).digest('hex');
const config = JSON.parse(read(path.join(SYS, 'config.json'))) as { combine: 'primary' | 'union_structural'; readers: string[]; why?: string };

function assertFrozen() {
  if (!existsSync(FROZEN)) throw new Error('the system is not frozen. Run npm run rx -- freeze first.');
  const f = JSON.parse(read(FROZEN)) as { sha256: Record<string, string> };
  const changed = Object.entries(f.sha256).filter(([file, h]) => sha(file) !== h).map(([file]) => file);
  if (changed.length) throw new Error(`frozen files changed: ${changed.join(', ')}`);
}

// ─── Sets ───────────────────────────────────────────────────────────────────

type Set = 'dev' | 'proposed' | 'reviewed' | 'heldout';
interface Line {
  id: string;
  input: RxInput;
  gold: GoldLine;
}

function loadSet(set: Set): Line[] {
  if (set === 'dev') {
    return read(path.join(RX, 'dev/dev-set.jsonl')).split('\n').filter((l) => l.trim()).map((l) => {
      const x = JSON.parse(l);
      return { id: x.id, input: x.input, gold: { needed: x.label.flag.needed, reasons: x.label.flag.reasons, tier: x.label.tier, bucket: !x.label.flag.needed ? 'clean' : x.label.judgment_only ? 'judgment' : 'required' } };
    });
  }
  if (set === 'heldout') {
    assertFrozen();
    const ver = JSON.parse(read(path.join(RX, 'heldout/verification.json'))) as Record<string, { all_verified: boolean; checks: unknown[] }>;
    return read(path.join(RX, 'heldout/heldout.jsonl')).split('\n').filter((l) => l.trim()).map((l) => {
      const x = JSON.parse(l);
      const verified = ver[x.id]?.all_verified ?? false;
      const bucket = !x.label.flag.needed ? (verified ? 'clean' : 'unverified') : x.label.judgment_only ? 'judgment' : verified ? 'required' : 'unverified';
      return { id: x.id, input: x.input, gold: { needed: x.label.flag.needed, reasons: x.label.flag.reasons, tier: x.label.tier, bucket } };
    });
  }
  const items = read(path.join(ROOT, 'bench/sig-bench/items-v2.jsonl')).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  return items
    .filter((i) => (set === 'proposed' ? i.label_status === 'proposed' : i.label_status !== 'proposed'))
    .map((i) => {
      const reasons: string[] = i.label.flag.reasons;
      const hold = reasons.length > 0 && reasons.every((r) => r === 'reviewer_hold');
      const tier = i.label.clarify?.tier ?? null;
      const bucket = !i.label.flag.needed ? 'clean' : hold ? 'hold' : tier === 'judgment' ? 'judgment' : 'required';
      return { id: i.id, input: i.input, gold: { needed: i.label.flag.needed, reasons, tier, bucket } };
    });
}

// ─── Readers ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = read(path.join(SYS, 'extract-system.txt')).trim();
const USER_PROMPT = read(path.join(SYS, 'extract-user.txt'));
export function renderRx(input: RxInput): string {
  const b = (v: string | null) => v ?? '(blank)';
  return [`Drug: ${b(input.drug_description)}`, `Strength: ${b(input.strength)}`, `Dosage form: ${b(input.dosage_form)}`, `Sig: ${input.sig}`, `Quantity: ${input.quantity.value} ${input.quantity.unit}`, `Days supply: ${input.days_supply}`].join('\n');
}
const promptFor = (input: RxInput) => USER_PROMPT.replace('{{input}}', renderRx(input));

const runner = new FlowRunner();
async function askQwen(prompt: string): Promise<{ text: string; error: string | null; wallMs: number }> {
  const modelConfig: ModelConfig = { provider: 'ollama', model: 'qwen3.8:27b', temperature: 0, format: 'json', think: false, systemPrompt: SYSTEM_PROMPT, numCtx: 8192, endpointUrl: 'http://localhost:11434/api/generate', timeoutMs: 120_000 };
  const flow: Flow = { id: 'rx', name: 'rx', initialInput: prompt, steps: [{ id: 'read', name: 'read', prompt: '{{input}}', modelConfig, status: 'idle', output: '' }] };
  const t = performance.now();
  const res = await runner.runFlow(flow, { strictPlaceholders: true });
  const s = res.flow.steps[0];
  return { text: s.output ?? '', error: s.error ?? null, wallMs: Math.round(performance.now() - t) };
}

async function waitForLoad() {
  for (;;) {
    const l = os.loadavg()[0];
    if (l <= 150) return Math.round(l * 10) / 10;
    process.stdout.write(`load ${l.toFixed(1)} is above 150, waiting 60 s\n`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

async function extract(set: Set, reader: string) {
  const lines = loadSet(set);
  const dir = path.join(RX, 'runs', set);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${reader}.jsonl`);
  const done = new Set(existsSync(file) ? read(file).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l).id) : []);
  if (reader === 'opus') assertSubscription();
  let n = 0;
  const todo = lines.filter((l) => !done.has(l.id));
  for (const line of todo) {
    const load = await waitForLoad();
    const prompt = promptFor(line.input);
    const r = reader === 'opus' ? await claudePrint({ system: SYSTEM_PROMPT, prompt, timeoutMs: 120_000 }) : await askQwen(prompt);
    appendFileSync(file, JSON.stringify({ id: line.id, reader, output: r.text, error: r.error, wallMs: r.wallMs, load1m: load, at: new Date().toISOString() }) + '\n');
    n++;
    if (set !== 'heldout') process.stdout.write(`${reader} ${set} ${n}/${todo.length} ${line.id} ${(r.wallMs / 1000).toFixed(1)} s${r.error ? ` ERROR ${r.error}` : ''}\n`);
    else process.stdout.write(`${reader} ${set} ${n}/${todo.length}${r.error ? ' ERROR' : ''}\n`);
  }
}

// ─── Decide and score ───────────────────────────────────────────────────────

function readings(set: Set, reader: string): Map<string, Reading | null> {
  const file = path.join(RX, 'runs', set, `${reader}.jsonl`);
  const out = new Map<string, Reading | null>();
  if (!existsSync(file)) return out;
  for (const l of read(file).split('\n').filter((x) => x.trim())) {
    const row = JSON.parse(l);
    out.set(row.id, row.error ? null : (jsonFrom(row.output) as Reading | null));
  }
  return out;
}

async function decideLine(line: Line, r: Reading | null, tiers: TierTable): Promise<Decision | null> {
  if (!r) return null;
  const generic = r.generic ?? line.input.drug_description;
  const token = ([line.input.drug_description, line.input.dosage_form].join(' ').match(/\b(XL|XR|SR|ER|CR|LA|CD|24 ?HR?)\b/i) ?? [null])[0];
  const facts = generic ? await factsFor(FACTS, generic, r.release ?? null, r.product_form ?? null, token ? token.toUpperCase() : null) : null;
  return decide(line.input, r, facts, tiers);
}

async function score(set: Set) {
  const lines = loadSet(set);
  const out = path.join(RX, 'runs', set, 'decisions.json');
  if (set === 'heldout' && existsSync(out)) throw new Error('the held-out set has been scored once already. Its result stands.');
  const tiers = parseTierTable(read(path.join(ROOT, 'bench/sig-bench/CLARIFICATION-RULES.md'))) as TierTable;
  const byReader = Object.fromEntries(config.readers.map((rd) => [rd, readings(set, rd)]));
  const decided: Array<{ id: string; decision: Decision | null; parts: Record<string, Decision | null> }> = [];
  for (const line of lines) {
    const parts: Record<string, Decision | null> = {};
    for (const rd of config.readers) parts[rd] = await decideLine(line, byReader[rd].get(line.id) ?? null, tiers);
    decided.push({ id: line.id, decision: combineDecisions(line.input, parts, config.combine, config.readers[0]), parts });
  }
  const result = scoreSet(lines.map((l) => l.gold), decided.map((d) => d.decision), lines.map((l) => l.id));
  writeFileSync(out, JSON.stringify({ set, scoredAt: new Date().toISOString(), config, frozen: existsSync(FROZEN) ? JSON.parse(read(FROZEN)).frozenAt : null, result, lines: decided.map((d, i) => ({ id: d.id, gold: lines[i].gold, decision: d.decision })) }, null, 1) + '\n');
  const m = result.metrics;
  if (set !== 'heldout') appendFileSync(path.join(RX, 'runs', 'dev-curve.jsonl'), JSON.stringify({ at: new Date().toISOString(), set, note: opt('--note') ?? null, readers: config.readers.filter((rd) => byReader[rd].size > 0), combine: config.combine, metrics: m }) + '\n');
  console.log(JSON.stringify(m));
  if (set !== 'heldout') for (const e of result.errors) console.log(`${e.kind} ${e.id}: gold ${e.gold} | system ${e.system}`);
}

function freeze() {
  const hashes = Object.fromEntries(SYSTEM_FILES.map((f) => [f, sha(f)]));
  writeFileSync(FROZEN, JSON.stringify({ frozenAt: new Date().toISOString(), note: 'Rx Intake Check system frozen before the held-out set was read. scripts/rx-intake.ts refuses the held-out set if any of these files change.', config, sha256: hashes }, null, 1) + '\n');
  console.log(`froze ${SYSTEM_FILES.length} files`);
}

const set = (opt('--set') ?? 'dev') as Set;
const main = async () => {
  if (cmd === 'extract') return extract(set, opt('--reader') ?? 'opus');
  if (cmd === 'score') return score(set);
  if (cmd === 'freeze') return freeze();
  throw new Error('command must be extract, score or freeze');
};
main().catch((err) => {
  console.error(`rx ${cmd} failed: ${(err as Error).message}`);
  process.exit(1);
});
