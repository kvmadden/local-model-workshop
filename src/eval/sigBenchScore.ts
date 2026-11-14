/**
 * Scorer for the sig bench (bench/sig-bench). Pure functions, no I/O.
 *
 * The labels are PROPOSED and not yet confirmed by a pharmacist, so every score this produces is a
 * score against proposed labels.
 *
 * Two ways to score a reply:
 * - Full label (`scoreBenchReply`). The reply uses the bench format (bench/sig-bench/schema.json): the
 *   six fields plus route, laterality, dose range, as-needed interval, daily maximums, duration, weekdays,
 *   phases, sliding scale and a clarification flag. On a line whose label needs clarification, only the flag
 *   is scored: the right answer is to flag it, not to guess. On every other line, all fields are scored and a
 *   flag is a miss.
 * - Six fields (`scoreSixField`). The reply uses the frozen six-field format. Only lines the six fields can
 *   hold are scored, with scorer v3 (src/eval/sigScoreV3.ts) unchanged. Scorer v3 and the rules baseline are
 *   frozen by eval/fresh-blind-set/lock.json, so this file builds on them and edits neither.
 */
import sixFieldSchema from '../../eval/sig-extraction/schema.json';
import { SIG_FIELDS, normalizeLabel, type SigField, type SigGold } from './sigScore';
import { doseMatchesV3, drugMatches, normalizeUnitV3, parsePredictionV3, reasonMatches, scoreCaseV3, strictNumber } from './sigScoreV3';

export interface BenchDose {
  value: number;
  unit: string;
}

export interface BenchPhase {
  dose: BenchDose | null;
  frequency: string | null;
  days: number | null;
  days_of_week: string[] | null;
}

export interface BenchScaleStep {
  bg_min: number | null;
  bg_max: number | null;
  units: number;
}

export interface BenchLabel {
  drug: string | null;
  dose_per_administration: BenchDose | null;
  frequency: string | null;
  timing: string | null;
  prn: boolean;
  prn_indication: string | null;
  route: string | null;
  laterality: string | null;
  dose_high: number | null;
  prn_interval: { min: number; max: number; unit: 'min' | 'h' } | null;
  max_doses_per_day: number | null;
  max_daily_dose: BenchDose | null;
  duration_days: number | null;
  days_of_week: string[] | null;
  phases: BenchPhase[] | null;
  sliding_scale: BenchScaleStep[] | null;
  needs_clarification: boolean;
  clarification_reason: string | null;
}

export interface BenchItem {
  id: string;
  sig: string;
  tier: 'clean' | 'hard';
  categories: string[];
  /** Always "proposed" until Kevin confirms the label. */
  label_status: 'proposed' | 'confirmed';
  label: BenchLabel;
  /** The frequency under the frozen prompt's reading, where an as-needed rate counts as a schedule. */
  alt?: { frequency?: string | null };
  /** Other spellings that also count as right (an abbreviation as written, for example). */
  accept?: { drug?: string[]; prn_indication?: string[] };
  note: string | null;
}

export const BENCH_FIELDS = [
  ...SIG_FIELDS,
  'route', 'laterality', 'dose_high', 'prn_interval', 'max_doses_per_day', 'max_daily_dose',
  'duration_days', 'days_of_week', 'phases', 'sliding_scale', 'needs_clarification',
] as const;
export type BenchField = (typeof BENCH_FIELDS)[number];

// ─── Which lines the six fields can hold ──────────────────────────────────────

const SIX_FREQUENCIES: ReadonlySet<string | null> = new Set(sixFieldSchema.properties.frequency.enum as Array<string | null>);
const SIX_UNITS: ReadonlySet<string> = new Set(sixFieldSchema.properties.dose_per_administration.properties.unit.enum);

/**
 * True when the six fields hold the line's dose and schedule without loss. Route, laterality, caps,
 * intervals, duration and weekdays are facts the six fields leave out, so they do not make a line
 * unrepresentable. A range, phases, a sliding scale, a missing drug or dose, a unit or frequency outside
 * the six-field lists, or a line that needs clarification do.
 */
export function sixFieldRepresentable(l: BenchLabel): boolean {
  return (
    !l.needs_clarification &&
    l.drug !== null &&
    l.dose_per_administration !== null &&
    SIX_UNITS.has(l.dose_per_administration.unit) &&
    SIX_FREQUENCIES.has(l.frequency) &&
    l.dose_high === null &&
    l.phases === null &&
    l.sliding_scale === null
  );
}

/** The six-field gold of a representable line, under Kevin's ruling or under the frozen prompt's reading. */
export function sixFieldGold(item: BenchItem, reading: 'ruling' | 'prompt' = 'ruling'): SigGold | null {
  const l = item.label;
  if (!sixFieldRepresentable(l)) return null;
  const frequency = reading === 'prompt' && item.alt && 'frequency' in item.alt ? item.alt.frequency ?? null : l.frequency;
  return {
    id: item.id,
    drug: l.drug as string,
    drug_match: l.drug as string,
    dose_per_administration: l.dose_per_administration as BenchDose,
    frequency,
    timing: l.timing,
    prn: l.prn,
    prn_indication: l.prn_indication,
  };
}

// ─── Field comparisons ────────────────────────────────────────────────────────

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const isNullish = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

const EXTRA_UNITS: Record<string, string> = { meq: 'mEq', drop: 'drop', drops: 'drop', gtt: 'drop', gtts: 'drop', patch: 'patch', patches: 'patch' };
const MASS_IN_MCG: Record<string, number> = { mcg: 1, mg: 1_000, g: 1_000_000 };

/** Canonical unit for the bench: scorer v3's units first, then mEq, drop and patch. Null when unknown. */
export function benchUnit(unit: unknown): string | null {
  const v3 = normalizeUnitV3(unit);
  if (v3) return v3;
  if (typeof unit !== 'string') return null;
  return EXTRA_UNITS[unit.normalize('NFKC').trim().toLowerCase()] ?? null;
}

/** An amount and unit against the gold. Mass units convert. Null gold wants a null reply. */
export function amountMatches(pred: unknown, gold: BenchDose | null): boolean {
  if (gold === null) return isNullish(pred);
  if (normalizeUnitV3(gold.unit)) return doseMatchesV3(pred, gold);
  if (!pred || typeof pred !== 'object' || Array.isArray(pred)) return false;
  const { value, unit } = pred as { value?: unknown; unit?: unknown };
  const amount = strictNumber(value);
  return amount !== null && benchUnit(unit) === benchUnit(gold.unit) && close(amount, gold.value);
}

/** Factor that turns an amount in the reply's dose unit into the gold's dose unit, or null. */
function unitFactor(replyDose: unknown, goldDose: BenchDose | null): number | null {
  if (!goldDose || !replyDose || typeof replyDose !== 'object') return null;
  const from = benchUnit((replyDose as { unit?: unknown }).unit);
  const to = benchUnit(goldDose.unit);
  if (!from || !to) return null;
  if (from === to) return 1;
  if (from in MASS_IN_MCG && to in MASS_IN_MCG) return MASS_IN_MCG[from] / MASS_IN_MCG[to];
  return null;
}

function numberMatches(pred: unknown, gold: number | null, factor = 1): boolean {
  if (gold === null) return isNullish(pred);
  const n = strictNumber(pred);
  return n !== null && close(n * factor, gold);
}

function wordMatches(pred: unknown, gold: string | null): boolean {
  if (gold === null) return isNullish(pred);
  return typeof pred === 'string' && pred.trim().toLowerCase() === gold;
}

const MINUTES: Record<string, number> = { min: 1, h: 60 };

function intervalMatches(pred: unknown, gold: BenchLabel['prn_interval']): boolean {
  if (gold === null) return isNullish(pred);
  if (!pred || typeof pred !== 'object' || Array.isArray(pred)) return false;
  const { min, max, unit } = pred as { min?: unknown; max?: unknown; unit?: unknown };
  const per = typeof unit === 'string' ? MINUTES[unit.trim().toLowerCase()] : undefined;
  const lo = strictNumber(min);
  const hi = strictNumber(max);
  if (!per || lo === null || hi === null) return false;
  return close(lo * per, gold.min * MINUTES[gold.unit]) && close(hi * per, gold.max * MINUTES[gold.unit]);
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** A weekday from a full name or its first three letters, or null. */
function dayOf(word: unknown): string | null {
  if (typeof word !== 'string') return null;
  const w = word.trim().toLowerCase();
  return DAYS.find((d) => d === w || (w.length >= 3 && d.startsWith(w))) ?? null;
}

function daysMatch(pred: unknown, gold: string[] | null): boolean {
  if (gold === null) return isNullish(pred) || (Array.isArray(pred) && pred.length === 0);
  if (!Array.isArray(pred)) return false;
  const days = pred.map(dayOf);
  if (days.some((d) => d === null)) return false;
  const a = [...new Set(days as string[])].sort();
  const b = [...new Set(gold)].sort();
  return a.length === b.length && a.every((d, i) => d === b[i]);
}

function phaseMatches(pred: unknown, gold: BenchPhase): boolean {
  if (!pred || typeof pred !== 'object' || Array.isArray(pred)) return false;
  const p = pred as Record<string, unknown>;
  return amountMatches(p.dose, gold.dose) && normalizeLabel(p.frequency) === normalizeLabel(gold.frequency) && numberMatches(p.days, gold.days) && daysMatch(p.days_of_week, gold.days_of_week);
}

/** Phases in order. Concurrent weekday phases (every gold phase has weekdays) may come in any order. */
function phasesMatch(pred: unknown, gold: BenchPhase[] | null): boolean {
  if (gold === null) return isNullish(pred) || (Array.isArray(pred) && pred.length === 0);
  if (!Array.isArray(pred) || pred.length !== gold.length) return false;
  if (gold.every((g, i) => phaseMatches(pred[i], g))) return true;
  if (!gold.every((g) => g.days_of_week)) return false;
  const left = [...pred];
  return gold.every((g) => {
    const at = left.findIndex((p) => phaseMatches(p, g));
    if (at === -1) return false;
    left.splice(at, 1);
    return true;
  });
}

function scaleMatches(pred: unknown, gold: BenchScaleStep[] | null): boolean {
  if (gold === null) return isNullish(pred) || (Array.isArray(pred) && pred.length === 0);
  if (!Array.isArray(pred) || pred.length !== gold.length) return false;
  const key = (s: { bg_min?: unknown }) => strictNumber(s?.bg_min) ?? -Infinity;
  const sorted = [...pred].sort((a, b) => key(a) - key(b));
  const goldSorted = [...gold].sort((a, b) => key(a) - key(b));
  return goldSorted.every((g, i) => {
    const p = sorted[i] as Record<string, unknown> | undefined;
    return !!p && numberMatches(p.bg_min, g.bg_min) && numberMatches(p.bg_max, g.bg_max) && numberMatches(p.units, g.units);
  });
}

function drugOk(pred: unknown, item: BenchItem): boolean {
  const gold = item.label.drug;
  if (gold === null) return isNullish(pred);
  return [gold, ...(item.accept?.drug ?? [])].some((d) => drugMatches(pred, d, item.sig));
}

function reasonOk(pred: unknown, item: BenchItem): boolean {
  const gold = item.label.prn_indication;
  if (gold === null) return reasonMatches(pred, null);
  return [gold, ...(item.accept?.prn_indication ?? [])].some((r) => reasonMatches(pred, r));
}

// ─── Full-label score ─────────────────────────────────────────────────────────

export interface BenchScore {
  id: string;
  parsed: boolean;
  /** Per field: true or false, or null when the field is not scored on this line. */
  fields: Record<BenchField, boolean | null>;
  allCorrect: boolean;
}

export function scoreBenchReply(item: BenchItem, replyText: string): BenchScore {
  const { value } = parsePredictionV3(replyText);
  const none = Object.fromEntries(BENCH_FIELDS.map((f) => [f, null])) as Record<BenchField, boolean | null>;
  if (!value) return { id: item.id, parsed: false, fields: none, allCorrect: false };
  const p = value as Record<string, unknown>;
  const g = item.label;
  const flagged = p.needs_clarification === true;
  if (g.needs_clarification) {
    return { id: item.id, parsed: true, fields: { ...none, needs_clarification: flagged }, allCorrect: flagged };
  }
  const factor = unitFactor(p.dose_per_administration, g.dose_per_administration) ?? 1;
  const fields: Record<BenchField, boolean | null> = {
    drug: drugOk(p.drug, item),
    dose: amountMatches(p.dose_per_administration, g.dose_per_administration),
    frequency: normalizeLabel(p.frequency) === normalizeLabel(g.frequency),
    timing: normalizeLabel(p.timing) === normalizeLabel(g.timing),
    prn: p.prn === g.prn,
    prn_indication: reasonOk(p.prn_indication, item),
    route: wordMatches(p.route, g.route),
    laterality: wordMatches(p.laterality, g.laterality),
    dose_high: numberMatches(p.dose_high, g.dose_high, factor),
    prn_interval: intervalMatches(p.prn_interval, g.prn_interval),
    max_doses_per_day: numberMatches(p.max_doses_per_day, g.max_doses_per_day),
    max_daily_dose: amountMatches(p.max_daily_dose, g.max_daily_dose),
    duration_days: numberMatches(p.duration_days, g.duration_days),
    days_of_week: daysMatch(p.days_of_week, g.days_of_week),
    phases: phasesMatch(p.phases, g.phases),
    sliding_scale: scaleMatches(p.sliding_scale, g.sliding_scale),
    needs_clarification: !flagged,
  };
  return { id: item.id, parsed: true, fields, allCorrect: Object.values(fields).every((v) => v === true) };
}

// ─── Six-field score ──────────────────────────────────────────────────────────

export interface SixFieldScore {
  id: string;
  parsed: boolean;
  fields: Record<SigField, boolean>;
  allCorrect: boolean;
}

/**
 * A six-field reply on a representable line, scored with scorer v3. A drug or reason the item lists in
 * `accept` also counts. Null for a line the six fields cannot hold.
 */
export function scoreSixField(item: BenchItem, replyText: string, reading: 'ruling' | 'prompt' = 'ruling'): SixFieldScore | null {
  const gold = sixFieldGold(item, reading);
  if (!gold) return null;
  const v3 = scoreCaseV3(gold, replyText, item.sig);
  const fields = Object.fromEntries(SIG_FIELDS.map((f) => [f, v3[f]])) as Record<SigField, boolean>;
  if (v3.parsed) {
    const pred = parsePredictionV3(replyText).value as Record<string, unknown>;
    if (!fields.drug) fields.drug = drugOk(pred.drug, item);
    if (!fields.prn_indication) fields.prn_indication = reasonOk(pred.prn_indication, item);
  }
  return { id: item.id, parsed: v3.parsed, fields, allCorrect: v3.parsed && SIG_FIELDS.every((f) => fields[f]) };
}
