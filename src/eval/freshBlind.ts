/**
 * Scoring for the fresh blind set (eval/fresh-blind-set/RUN-PLAN.md). Pure functions, no files and no network,
 * so the rules are unit tested on made-up data. The command is scripts/score-fresh-blind.ts.
 *
 * It carries out the registered plan:
 * - Lines are sorted into gate lines, contested lines and lines the six fields cannot hold (section 3).
 * - Scorer v3 scores every reply against the six-field gold. For a drug written differently from its ingredient,
 *   a reply that matches either counts (section 6, choice 4), and the ingredient-only reading is reported too.
 * - A critical error is a reply that disagrees with the gold on a field marked critical for that line, among
 *   the drug, the dose, the frequency and the as-needed status (section 6, choice 2). Route cannot be checked.
 *   A reply that cannot be read counts as a critical error. Only gate lines are counted.
 * - Latency counts every timed request. Memory comes from the sampler. A model passes a gate only if it passes it in
 *   both passes (section 6, choice 1).
 */
import { SIG_FIELDS, type SigField, type SigGold } from './sigScore';
import { parsePredictionV3, scoreCaseV3 } from './sigScoreV3';
import { exactInterval, latencySummary, type LatencySummary, type TimedRequest } from './harness';

// ─── Labels ─────────────────────────────────────────────────────────────────────

export interface SixField {
  drug: string;
  dose_per_administration: { value: number; unit: string };
  frequency: string | null;
  timing: string | null;
  prn: boolean;
  prn_indication: string | null;
}

export interface CriticalMark {
  med: number;
  fields: string[];
}

export interface FinalLabel {
  id: string;
  six_field: SixField | null;
  six_field_representable: boolean;
  contested: boolean;
  contested_convention?: string | null;
  critical_fields: CriticalMark[];
  categories: Array<string | number>;
  meds: Array<{
    drug_text?: string | null;
    ingredient?: string | null;
    schedule?: { anchors?: Array<{ when?: string | null } | string> | null } | null;
  }>;
  alt?: { six_field: SixField | null; six_field_representable?: boolean; critical_fields?: CriticalMark[] } | null;
}

/** Kevin's answers and decisions, as a file. Everything is optional. */
export interface Overrides {
  decisions?: {
    /** Whether the bedtime reading of "as needed" also holds for a morning or an evening anchor. */
    c1_other_anchors?: 'contested' | 'gate';
  };
  /** Ids of the reviewed lines, whether or not Kevin changed anything. */
  reviewed?: string[];
  /** Replacement gold for the lines Kevin changed. */
  lines?: Record<string, { six_field?: SixField | null; six_field_representable?: boolean; critical_fields?: CriticalMark[]; drug_text?: string; alt?: { six_field: SixField | null } }>;
}

export function applyOverrides(labels: FinalLabel[], overrides: Overrides): FinalLabel[] {
  const known = new Set(labels.map((l) => l.id));
  for (const id of [...(overrides.reviewed ?? []), ...Object.keys(overrides.lines ?? {})]) {
    if (!known.has(id)) throw new Error(`the overrides name ${id}, which is not a line in the set`);
  }
  return labels.map((l) => {
    const o = overrides.lines?.[l.id];
    if (!o) return l;
    const next: FinalLabel = { ...l };
    if ('six_field' in o) next.six_field = o.six_field ?? null;
    if (o.six_field_representable !== undefined) next.six_field_representable = o.six_field_representable;
    if (o.critical_fields) next.critical_fields = o.critical_fields;
    if (o.drug_text !== undefined) next.meds = [{ ...(l.meds[0] ?? {}), drug_text: o.drug_text }, ...l.meds.slice(1)];
    if (o.alt) next.alt = { ...(l.alt ?? { six_field: null }), six_field: o.alt.six_field };
    if (next.six_field_representable && !next.six_field) throw new Error(`line ${l.id} is representable but has no six-field gold`);
    return next;
  });
}

export type LineStatus = 'gate' | 'contested' | 'not_representable';

/** 'bedtime' when the first drug's anchors include a bedtime anchor, otherwise 'other'. */
export function anchorKind(label: FinalLabel): 'bedtime' | 'other' {
  const anchors = label.meds[0]?.schedule?.anchors ?? [];
  const whens = anchors.map((a) => (typeof a === 'string' ? a : a?.when ?? ''));
  return whens.includes('bedtime') ? 'bedtime' : 'other';
}

export function lineStatus(label: FinalLabel, decisions: Overrides['decisions'] = {}): LineStatus {
  if (!label.six_field_representable) return 'not_representable';
  if (!label.contested) return 'gate';
  if (label.contested_convention === 'C1') {
    // Kevin's ruling names "at bedtime as needed". Other times of day wait for his word.
    if (anchorKind(label) === 'bedtime') return 'gate';
    return decisions?.c1_other_anchors === 'gate' ? 'gate' : 'contested';
  }
  return 'contested';
}

// ─── Scoring one reply ──────────────────────────────────────────────────────────

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);

/** The drug as the line writes it, when that is not the ingredient. Otherwise null. */
export function writtenDrug(label: FinalLabel): string | null {
  const written = label.meds[0]?.drug_text?.trim().toLowerCase();
  const ingredient = label.six_field?.drug ?? label.meds[0]?.ingredient ?? '';
  if (!written) return null;
  const w = words(written);
  for (const word of words(ingredient)) if (!w.has(word)) return written;
  return null;
}

export function goldOf(label: FinalLabel, reading: 'primary' | 'alt'): SigGold | null {
  const sf = reading === 'alt' ? label.alt?.six_field : label.six_field;
  if (!sf) return null;
  return {
    id: label.id,
    drug: sf.drug,
    drug_match: sf.drug,
    dose_per_administration: sf.dose_per_administration,
    frequency: sf.frequency,
    timing: sf.timing,
    prn: sf.prn,
    prn_indication: sf.prn_indication,
  };
}

/** The marked critical fields a six-field reply can be checked on, by the name the label uses. */
const CHECKABLE: Record<string, SigField> = { drug: 'drug', dose: 'dose', schedule: 'frequency', as_needed: 'prn' };

export interface LineScore {
  id: string;
  parsed: boolean;
  fields: Record<SigField, boolean>;
  /** All six fields, with either drug reading. */
  allCorrect: boolean;
  /** All six fields with the ingredient as the only right drug. */
  allCorrectIngredientOnly: boolean;
  /** The marked critical fields the reply got wrong, or ['unparsed']. Empty when none. */
  criticalWrong: string[];
  /** True when route is marked critical, which a six-field reply cannot be checked on. */
  routeNotCheckable: boolean;
}

/** The schema the scorer checks replies against (the type is not exported by the scorer). */
export type SchemaArg = Parameters<typeof scoreCaseV3>[3];

export function scoreLine(label: FinalLabel, reply: string, input: string, schema: SchemaArg, reading: 'primary' | 'alt' = 'primary'): LineScore {
  const gold = goldOf(label, reading);
  if (!gold) throw new Error(`line ${label.id} has no six-field gold for the ${reading} reading`);
  const base = scoreCaseV3(gold, reply, input, schema);
  const written = reading === 'primary' ? writtenDrug(label) : null;
  const drugOk = base.drug || (written !== null && scoreCaseV3({ ...gold, drug: written, drug_match: written }, reply, input, schema).drug);
  const fields = Object.fromEntries(SIG_FIELDS.map((f) => [f, f === 'drug' ? drugOk : base[f]])) as Record<SigField, boolean>;
  const marks = reading === 'primary' ? label.critical_fields.filter((m) => m.med === 0).flatMap((m) => m.fields) : [];
  const checkable = marks.filter((m) => m in CHECKABLE);
  const criticalWrong = !base.parsed ? (checkable.length ? ['unparsed'] : []) : checkable.filter((m) => !fields[CHECKABLE[m]]);
  return {
    id: label.id,
    parsed: base.parsed,
    fields,
    allCorrect: SIG_FIELDS.every((f) => fields[f]),
    allCorrectIngredientOnly: base.allCorrect,
    criticalWrong,
    routeNotCheckable: marks.includes('route'),
  };
}

// ─── Tallies ────────────────────────────────────────────────────────────────────

export interface Tally {
  k: number;
  n: number;
  interval: [number, number];
}

export const tally = (k: number, n: number): Tally => ({ k, n, interval: exactInterval(k, n) });

export interface ReplyRow {
  id: string;
  input: string;
  output: string;
  error: string | null;
  latencyMs: number | null;
  wallMs: number | null;
  position: number;
}

export interface PassScore {
  lines: number;
  gate: number;
  contested: number;
  notRepresentable: number;
  allCorrect: Tally;
  allCorrectIngredientOnly: Tally;
  perField: Record<SigField, number>;
  critical: Tally;
  criticalByField: Record<string, number>;
  routeNotCheckable: number;
  contestedPrimary: Tally;
  contestedAlt: Tally;
  notRepresentableParsed: number;
  categories: Record<string, Tally>;
}

/** Scores one set of replies (a model in a pass, or a baseline). Every label needs exactly one row. */
export function scoreReplies(labels: FinalLabel[], statuses: Map<string, LineStatus>, rows: ReplyRow[], schema: SchemaArg): PassScore {
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (byId.size !== rows.length) throw new Error('two replies share a line id');
  const perField = Object.fromEntries(SIG_FIELDS.map((f) => [f, 0])) as Record<SigField, number>;
  const criticalByField: Record<string, number> = {};
  const catTotals: Record<string, { k: number; n: number }> = {};
  let gate = 0, contested = 0, notRep = 0, allOk = 0, allIngredient = 0, criticalLines = 0, routeNot = 0, cPrimary = 0, cAlt = 0, notRepParsed = 0;
  for (const label of labels) {
    const row = byId.get(label.id);
    if (!row) throw new Error(`no reply for line ${label.id}`);
    const status = statuses.get(label.id);
    if (!status) throw new Error(`no status for line ${label.id}`);
    if (status === 'not_representable') {
      notRep += 1;
      if (parsePredictionV3(row.output).value) notRepParsed += 1;
    } else if (status === 'contested') {
      contested += 1;
      if (scoreLine(label, row.output, row.input, schema, 'primary').allCorrect) cPrimary += 1;
      if (label.alt?.six_field && scoreLine(label, row.output, row.input, schema, 'alt').allCorrect) cAlt += 1;
    } else {
      gate += 1;
      const s = scoreLine(label, row.output, row.input, schema, 'primary');
      if (s.allCorrect) allOk += 1;
      if (s.allCorrectIngredientOnly) allIngredient += 1;
      for (const f of SIG_FIELDS) if (s.fields[f]) perField[f] += 1;
      if (s.criticalWrong.length) criticalLines += 1;
      for (const f of s.criticalWrong) criticalByField[f] = (criticalByField[f] ?? 0) + 1;
      if (s.routeNotCheckable) routeNot += 1;
      for (const c of new Set(label.categories.map(String))) {
        const t = (catTotals[c] ??= { k: 0, n: 0 });
        t.n += 1;
        if (s.allCorrect) t.k += 1;
      }
    }
  }
  return {
    lines: labels.length,
    gate,
    contested,
    notRepresentable: notRep,
    allCorrect: tally(allOk, gate),
    allCorrectIngredientOnly: tally(allIngredient, gate),
    perField,
    critical: tally(criticalLines, gate),
    criticalByField,
    routeNotCheckable: routeNot,
    contestedPrimary: tally(cPrimary, contested),
    contestedAlt: tally(cAlt, contested),
    notRepresentableParsed: notRepParsed,
    categories: Object.fromEntries(Object.keys(catTotals).sort((a, b) => Number(a) - Number(b)).map((c) => [c, tally(catTotals[c].k, catTotals[c].n)])),
  };
}

// ─── Latency, stability, memory ─────────────────────────────────────────────────

export function timedFromRows(rows: ReplyRow[]): TimedRequest[] {
  return rows.map((r) => ({ ms: r.latencyMs ?? r.wallMs ?? 0, error: r.error !== null, position: r.position }));
}

export interface LatencyGate {
  summary: LatencySummary;
  pass: boolean;
  why: string;
}

export const LATENCY_BUDGET_MS = 10_000;
export const LATENCY_MIN_REQUESTS = 300;

export function latencyGate(rows: ReplyRow[], budgetMs = LATENCY_BUDGET_MS): LatencyGate {
  const summary = latencySummary(timedFromRows(rows), budgetMs);
  if (summary.requests < LATENCY_MIN_REQUESTS) return { summary, pass: false, why: `only ${summary.requests} requests, the protocol needs ${LATENCY_MIN_REQUESTS}` };
  const pass = summary.p95 !== null && summary.p95 <= budgetMs;
  return { summary, pass, why: pass ? 'p95 within the budget' : 'p95 over the budget' };
}

export const CRITICAL_UPPER_LIMIT = 0.02;
export const criticalGatePasses = (critical: Tally): boolean => critical.n > 0 && critical.interval[1] <= CRITICAL_UPPER_LIMIT;

const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  return v;
};

/** How many lines got a different parsed answer in the second pass. A reply that cannot be parsed is its own answer. */
export function differingAnswers(a: ReplyRow[], b: ReplyRow[]): { lines: number; differ: number } {
  const key = (r: ReplyRow) => JSON.stringify(canonical(parsePredictionV3(r.output).value));
  const second = new Map(b.map((r) => [r.id, key(r)]));
  let differ = 0;
  for (const r of a) if (second.get(r.id) !== key(r)) differ += 1;
  return { lines: a.length, differ };
}

export interface MemorySample {
  t: number;
  load1: number;
  procs: Array<{ pid: number; rss_kb: number; cmd: string }>;
  resident: Array<{ name: string; size?: number | null; size_vram?: number | null }> | { error: string };
}

export interface MemoryPeak {
  samples: number;
  peakRssMb: number | null;
  peakLoadedSizeMb: number | null;
  loadRange: [number, number] | null;
  /** Samples where a model other than the three under test was loaded as well. */
  otherModelSamples: number;
  /** Samples where two of the models under test were loaded at once, which are not attributed to either. */
  overlapSamples: number;
}

/** Peak resident memory of the Ollama processes while exactly one of the models under test is loaded. */
export function peakMemory(samples: MemorySample[], models: string[], pathFragment = '/ollama/'): Record<string, MemoryPeak> {
  const out: Record<string, MemoryPeak> = Object.fromEntries(models.map((m) => [m, { samples: 0, peakRssMb: null, peakLoadedSizeMb: null, loadRange: null, otherModelSamples: 0, overlapSamples: 0 }]));
  for (const s of samples) {
    if (!Array.isArray(s.resident)) continue;
    const loaded = s.resident.map((r) => r.name);
    const under = loaded.filter((n) => models.includes(n));
    if (under.length > 1) {
      for (const m of under) out[m].overlapSamples += 1;
      continue;
    }
    if (under.length === 0) continue;
    const model = under[0];
    const o = out[model];
    o.samples += 1;
    if (loaded.some((n) => !models.includes(n))) o.otherModelSamples += 1;
    const rss = s.procs.filter((p) => p.cmd.includes(pathFragment)).reduce((n, p) => n + p.rss_kb, 0) / 1024;
    o.peakRssMb = o.peakRssMb === null ? rss : Math.max(o.peakRssMb, rss);
    const size = (s.resident.find((r) => r.name === model)?.size ?? 0) / 1048576;
    o.peakLoadedSizeMb = o.peakLoadedSizeMb === null ? size : Math.max(o.peakLoadedSizeMb, size);
    o.loadRange = o.loadRange === null ? [s.load1, s.load1] : [Math.min(o.loadRange[0], s.load1), Math.max(o.loadRange[1], s.load1)];
  }
  return out;
}

// ─── Putting it together ────────────────────────────────────────────────────────

export interface ModelInput {
  model: string;
  passes: ReplyRow[][];
}

export interface ModelReport {
  passes: Array<{ score: PassScore; latency: LatencyGate; criticalGate: boolean }>;
  differingAnswers: { lines: number; differ: number } | null;
  memory: MemoryPeak | null;
  gates: { critical: boolean; latency: boolean; eligible: boolean };
}

export function scoreModel(input: ModelInput, labels: FinalLabel[], statuses: Map<string, LineStatus>, schema: SchemaArg, memory: MemoryPeak | null): ModelReport {
  const keep = new Set(labels.map((l) => l.id));
  const passes = input.passes.map((rows) => {
    const used = rows.filter((r) => keep.has(r.id));
    const score = scoreReplies(labels, statuses, used, schema);
    return { score, latency: latencyGate(used), criticalGate: criticalGatePasses(score.critical) };
  });
  const critical = passes.every((p) => p.criticalGate);
  const latency = passes.every((p) => p.latency.pass);
  return {
    passes,
    differingAnswers: input.passes.length >= 2 ? differingAnswers(input.passes[0].filter((r) => keep.has(r.id)), input.passes[1].filter((r) => keep.has(r.id))) : null,
    memory,
    gates: { critical, latency, eligible: critical && latency },
  };
}

export interface Reading {
  name: string;
  labels: FinalLabel[];
}

/** The two readings the plan asks for: all lines, and all lines but the one whose label was printed before the lock. */
export function readings(labels: FinalLabel[], disclosedId = 'w-0193'): Reading[] {
  return [
    { name: `all ${labels.length} lines`, labels },
    { name: `${labels.filter((l) => l.id !== disclosedId).length} lines without ${disclosedId}`, labels: labels.filter((l) => l.id !== disclosedId) },
  ];
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
export const formatTally = (t: Tally) => `${t.k}/${t.n} (${pct(t.n ? t.k / t.n : 0)}, 95% CI ${pct(t.interval[0])} to ${pct(t.interval[1])})`;

/** The headline table for one reading: one row per model, one cell per pass. */
export function headlineMarkdown(name: string, models: Record<string, ModelReport>, baselines: Record<string, PassScore>): string {
  const lines = [
    `## ${name}`,
    '',
    '| Model | Critical errors (gate lines) | Six fields all right | p95 latency (s) | First request (s) | Peak resident memory (MB) | Gate 1 | Gate 3 | Eligible |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const [model, m] of Object.entries(models)) {
    const cells = (f: (p: ModelReport['passes'][number]) => string) => m.passes.map((p, i) => `pass ${i + 1}: ${f(p)}`).join('<br>');
    const s = (ms: number | null) => (ms === null ? 'n/a' : (ms / 1000).toFixed(1));
    lines.push(
      `| ${model} | ${cells((p) => formatTally(p.score.critical))} | ${cells((p) => formatTally(p.score.allCorrect))} | ${cells((p) => s(p.latency.summary.p95))} | ${cells((p) => s(p.latency.summary.firstRequestMs))} | ${m.memory?.peakRssMb == null ? 'n/a' : m.memory.peakRssMb.toFixed(0)} | ${m.gates.critical ? 'pass' : 'fail'} | ${m.gates.latency ? 'pass (under load)' : 'fail (under load)'} | ${m.gates.eligible ? 'yes' : 'no'} |`,
    );
  }
  for (const [b, s] of Object.entries(baselines)) lines.push(`| baseline: ${b} | ${formatTally(s.critical)} | ${formatTally(s.allCorrect)} | | | | | | |`);
  lines.push('');
  return lines.join('\n');
}
