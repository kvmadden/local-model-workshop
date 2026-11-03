/**
 * The run comparison the workshop opens on. It reads the committed raw replies of the split-format
 * runs, scores them with scorer v3 under either reading of "at bedtime as needed", and runs the
 * frozen rules parser on the same lines. Nothing here calls a model.
 *
 * Both sets are development data. The ruling of 3 November 2026 (Kevin Madden, PharmD) is that
 * "at bedtime as needed" means no fixed schedule, as needed, at most once a day. The six fields
 * have no place for the maximum, so under the ruling the frequency of those lines is null.
 */
import { SIG_FIELDS, type SigField, type SigGold } from '../eval/sigScore';
import { scoreCaseV3, parsePredictionV3 } from '../eval/sigScoreV3';
import { applyConvention, decide, stableAcrossRuns, type Convention, type Decision, type ModelEvidence, type SavedRow } from '../eval/decision';
import { runBaseline } from '../eval/sigBaselines';
import { exactInterval } from '../eval/stats';
import devGptRun1 from '../../eval/results/2026-10-30-v2-run1/raw-gpt-oss_20b.jsonl?raw';
import devGptRun2 from '../../eval/results/2026-10-30-v2-run2/raw-gpt-oss_20b.jsonl?raw';
import devGemmaRun1 from '../../eval/results/2026-10-30-v2-run1/raw-gemma4_31b.jsonl?raw';
import devGemmaRun2 from '../../eval/results/2026-10-30-v2-run2/raw-gemma4_31b.jsonl?raw';
import devQwenRun1 from '../../eval/results/2026-10-30-v2-run1/raw-qwen3.8_27b.jsonl?raw';
import devQwenRun2 from '../../eval/results/2026-10-30-v2-run2/raw-qwen3.8_27b.jsonl?raw';
import templatesGpt from '../../eval/results/heldout-v2/raw-gpt-oss_20b.jsonl?raw';
import templatesGemma from '../../eval/results/heldout-v2/raw-gemma4_31b.jsonl?raw';
import templatesQwen from '../../eval/results/heldout-v2/raw-qwen3.8_27b.jsonl?raw';

export type SetId = 'dev25' | 'templates12';
export type Reading = 'ruling' | 'first-gold';

export const READING_CONVENTION: Record<Reading, Convention> = {
  ruling: 'bedtime-prn-has-no-schedule',
  'first-gold': 'bedtime-prn-is-once-daily',
};

export const SET_INFO: Record<SetId, { label: string; short: string; runs: number; note: string }> = {
  dev25: { label: '25 development lines', short: '25 lines', runs: 2, note: 'The lines the answer format, prompt and labels were revised on.' },
  templates12: { label: '12 template lines', short: '12 lines', runs: 1, note: 'Six templates taken from the 25 lines, each filled in twice with a made-up drug name.' },
};

export const FIELD_LABELS: Record<SigField, { long: string; short: string }> = {
  drug: { long: 'Drug', short: 'Drug' },
  dose: { long: 'Dose', short: 'Dose' },
  frequency: { long: 'Frequency', short: 'Freq' },
  timing: { long: 'Timing', short: 'Time' },
  prn: { long: 'As needed', short: 'PRN' },
  prn_indication: { long: 'Reason', short: 'Why' },
};

interface ColumnSource { id: string; label: string; short: string; diskGb: number; files: Record<SetId, string[]> }

/** Disk sizes as written in docs/ORIGINAL-EVALUATION.md. The 2026-10-30 harness did not record them. */
const MODELS: ColumnSource[] = [
  { id: 'gpt-oss:20b', label: 'gpt-oss:20b', short: 'GPT-OSS', diskGb: 13.8, files: { dev25: [devGptRun1, devGptRun2], templates12: [templatesGpt] } },
  { id: 'gemma4:31b', label: 'gemma4:31b', short: 'Gemma', diskGb: 19.4, files: { dev25: [devGemmaRun1, devGemmaRun2], templates12: [templatesGemma] } },
  { id: 'qwen3.8:27b', label: 'qwen3.8:27b', short: 'Qwen', diskGb: 18.2, files: { dev25: [devQwenRun1, devQwenRun2], templates12: [templatesQwen] } },
];

export const RULES_ID = 'rules';

export interface BenchLine { id: string; input: string; gold: SigGold }

export interface Verdict {
  fields: Record<SigField, boolean>;
  allCorrect: boolean;
  /** The parsed answer, or null when the reply did not parse. */
  answer: Record<string, unknown> | null;
  missed: SigField[];
}

export interface BenchColumn {
  id: string;
  label: string;
  short: string;
  kind: 'model' | 'baseline';
  /** One entry per run, keyed by line id. The rules parser has one run. */
  runs: Array<Record<string, Verdict>>;
  allCorrect: number[];
  perField: Array<Record<SigField, number>>;
  /** Exact 95% interval for the all-fields count of each run, as proportions. */
  intervals: Array<[number, number]>;
  /** True when every run gave the same parsed answers. Null when there is one run. */
  stable: boolean | null;
}

export interface BenchView {
  set: SetId;
  reading: Reading;
  n: number;
  lines: BenchLine[];
  columns: BenchColumn[];
  decision: Decision;
}

const parseRows = (text: string): SavedRow[] => text.trim().split('\n').map((l) => JSON.parse(l) as SavedRow);

function verdict(gold: SigGold, output: string, input: string): Verdict {
  const s = scoreCaseV3(gold, output, input);
  const fields = Object.fromEntries(SIG_FIELDS.map((f) => [f, s[f]])) as Record<SigField, boolean>;
  return { fields, allCorrect: s.allCorrect, answer: parsePredictionV3(output).value as Record<string, unknown> | null, missed: SIG_FIELDS.filter((f) => !s[f]) };
}

function column(id: string, label: string, short: string, kind: BenchColumn['kind'], runs: Array<Record<string, Verdict>>, n: number, stable: boolean | null): BenchColumn {
  const allCorrect = runs.map((r) => Object.values(r).filter((v) => v.allCorrect).length);
  const perField = runs.map((r) => Object.fromEntries(SIG_FIELDS.map((f) => [f, Object.values(r).filter((v) => v.fields[f]).length])) as Record<SigField, number>);
  return { id, label, short, kind, runs, allCorrect, perField, intervals: allCorrect.map((k) => exactInterval(k, n)), stable };
}

const cache = new Map<string, BenchView>();

/** The comparison for one set under one reading. Computed once per combination. */
export function buildBench(set: SetId, reading: Reading): BenchView {
  const key = `${set}:${reading}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const convention = READING_CONVENTION[reading];
  const modelRows = MODELS.map((m) => m.files[set].map(parseRows));
  // The lines and their gold come from the saved rows, in file order, which is the order they ran.
  const lines: BenchLine[] = modelRows[0][0].map((r) => ({ id: r.id, input: r.input, gold: applyConvention(r.gold, convention) }));
  const n = lines.length;

  const columns: BenchColumn[] = MODELS.map((m, i) => {
    const runs = modelRows[i].map((rows) => Object.fromEntries(rows.map((r) => [r.id, verdict(applyConvention(r.gold, convention), r.output, r.input)])));
    return column(m.id, m.label, m.short, 'model', runs, n, modelRows[i].length > 1 ? stableAcrossRuns(modelRows[i]) : null);
  });
  // The frozen rules parser follows the selected reading, as a model is asked to follow the prompt.
  const bedtimeAsNeeded = reading === 'ruling' ? 'no-schedule' : 'once-daily';
  const rulesRun = Object.fromEntries(lines.map((l) => [l.id, verdict(l.gold, runBaseline('rules', l.input, { bedtimeAsNeeded }).text, l.input)]));
  columns.push(column(RULES_ID, 'Rules parser', 'Rules', 'baseline', [rulesRun], n, null));

  const evidence: ModelEvidence[] = MODELS.map((m, i) => ({ id: m.id, diskGb: m.diskGb, runs: modelRows[i] }));
  const view: BenchView = { set, reading, n, lines, columns, decision: decide(evidence, convention, { applied: false }) };
  cache.set(key, view);
  return view;
}

/** The line that decides the ranking on each set: the as-needed bedtime line. */
export const DECIDING_LINE: Record<SetId, string> = { dev25: 's25', templates12: 'h02' };

/** "86.3 to 100%" style, the way the docs print exact intervals. */
export function formatPercentInterval([lo, hi]: [number, number]): string {
  const pct = (x: number) => (x === 1 ? '100' : x === 0 ? '0' : (x * 100).toFixed(1));
  return `${pct(lo)} to ${pct(hi)}%`;
}

/** A field value as the comparison prints it. */
export function showValue(field: SigField, value: unknown): string {
  if (value === undefined) return 'missing';
  if (value === null) return 'none';
  if (field === 'dose' && value && typeof value === 'object') {
    const d = value as { value?: unknown; unit?: unknown };
    return `${String(d.value)} ${String(d.unit)}`;
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value).replace(/_/g, ' ');
}

/** The value of a field in a gold record or a parsed answer. The dose field is named differently in each. */
export function fieldValue(record: Record<string, unknown> | SigGold | null, field: SigField): unknown {
  if (!record) return undefined;
  const r = record as Record<string, unknown>;
  return field === 'dose' ? r.dose_per_administration : r[field];
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (k: number) => NUMBER_WORDS[k] ?? String(k);
const NOUN: Record<SetId, string> = { dev25: 'development lines', templates12: 'template lines' };

/** The all-fields count of each column in one run. A column with a single run uses it for every run. */
export function countsAt(view: BenchView, run: number): number[] {
  return view.columns.map((c) => c.allCorrect[Math.min(run, c.allCorrect.length - 1)]);
}

/** The headline the screen opens on, written from the counts so it stays true for every set, reading and run. */
export function headline(view: BenchView, run: number): string {
  const counts = countsAt(view, run);
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  const models = view.columns.filter((c) => c.kind === 'model').length;
  const noun = NOUN[view.set];
  const what =
    lo === hi
      ? lo === view.n ? `all ${view.n} ${noun}` : `${lo} of the ${view.n} ${noun}`
      : `${lo} ${hi - lo === 1 ? 'or' : 'to'} ${hi} of the ${view.n} ${noun}`;
  const who = word(models);
  return `${who.charAt(0).toUpperCase()}${who.slice(1)} local models and a simple rules parser each read ${what} fully right, so these lines can’t pick a model.`;
}

/**
 * What the misses have in common, and whether the other reading of the bedtime line changes who
 * comes out ahead. Written from the verdicts, so it says nothing the data does not show.
 */
export function missNote(view: BenchView, other: BenchView, run: number): string {
  const misses = view.columns.flatMap((c) =>
    Object.entries(c.runs[Math.min(run, c.runs.length - 1)]).flatMap(([line, v]) => v.missed.map((field) => ({ line, field }))),
  );
  if (misses.length === 0) return 'Nobody misses a single field on these lines.';
  const fields = [...new Set(misses.map((m) => m.field))];
  const lines = [...new Set(misses.map((m) => m.line))];
  const bedtime = lines.every((id) => /at bedtime as needed/i.test(view.lines.find((l) => l.id === id)?.input ?? ''));
  const flips = view.decision.pick !== null && other.decision.pick !== null && view.decision.pick !== other.decision.pick;
  if (fields.length === 1 && bedtime) {
    const where = lines.length === 1 ? 'the one line that says' : `the ${word(lines.length)} lines that say`;
    const flip = flips ? ` Read ${lines.length === 1 ? 'that line' : 'those lines'} the other way and a different model comes out ahead.` : '';
    return `Every miss is the same field, the ${FIELD_LABELS[fields[0]].long.toLowerCase()}, on ${where} “at bedtime as needed”.${flip}`;
  }
  return `The misses fall on ${word(fields.length)} field${fields.length === 1 ? '' : 's'} across ${word(lines.length)} line${lines.length === 1 ? '' : 's'}, marked in red below.`;
}
