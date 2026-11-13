/**
 * Scorer for sig bench v2 (bench/sig-bench/items-v2.jsonl). Pure functions, no I/O.
 *
 * v2 scores two tiers, separately:
 * - Flag. Did the reply say whether the line needs a call to the prescriber? Scored on every item.
 *   Reason recall is reported beside it and does not change the flag verdict.
 * - Likely reading. On the items whose label has a likely reading, each field of the reply's
 *   likely reading is compared with the label. An item can be flagged and still have a likely
 *   reading, so a reply can get the flag right and the reading wrong, or the other way round.
 *
 * - Clarification tier. On flagged items whose label names a tier, did the reply name the same one:
 *   law, standard or judgment (bench/sig-bench/CLARIFICATION-RULES.md). The other two tiers are
 *   scored the same way with or without it.
 *
 * Basis and confidence are recorded, not scored. Safety notes are scored as code recall.
 *
 * What a pharmacist would dispense can differ from what law or a standard requires before
 * dispensing. Items with a likely reading and a law or standard tier are counted apart: a reply
 * that does not flag one has dispensed its best guess where a call was required, even when the
 * guess is right.
 *
 * The v1 scorer (sigBenchScore.ts) and scorer v3 are unchanged. This file reuses v3's drug, reason,
 * unit and number helpers and edits none of them.
 */
import { normalizeLabel } from './sigScore';
import { drugMatches, normalizeUnitV3, parsePredictionV3, reasonMatches, strictNumber } from './sigScoreV3';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Amount {
  value: number;
  unit: string;
}
export interface Range {
  min: number;
  max: number;
  unit: string;
}
export interface Concentration {
  amount: Amount | null;
  per: { value: number; unit: string } | null;
  percent: number | null;
}
export interface V2Phase {
  dose: Range | null;
  quantity: Range | null;
  frequency: string | null;
  timing: string | null;
  days: number | null;
}
export interface V2WeekEntry {
  days: string[];
  dose: Range | null;
  quantity: Range | null;
}
export interface V2Limits {
  max_daily_dose: Amount | null;
  max_doses_per_day: number | null;
  max_doses_in_window: { count: number; window: { value: number; unit: 'min' | 'h' } } | null;
  max_repeats: number | null;
}
export interface V2Basis {
  kind: string;
  text: string;
  source: 'sig_text' | 'input_fields' | 'kevin_note' | 'pharmacy_knowledge';
}
export interface V2Reading {
  drug: string | null;
  dosage_form: string | null;
  package: 'multidose' | 'unit_dose' | null;
  route: string | null;
  laterality: string | null;
  concentration: Concentration | null;
  dose: Range | null;
  quantity: Range | null;
  application_amount: { qualifier: string; length: { value: number; unit: string } | null } | null;
  frequency: string | null;
  frequency_range: { min: number; max: number; per: 'day' } | null;
  timing: string | null;
  prn: boolean;
  prn_indication: string | null;
  prn_interval: { min: number; max: number; unit: 'min' | 'h' } | null;
  limits: V2Limits;
  duration_days: number | null;
  days_of_week: string[] | null;
  weekly_schedule: V2WeekEntry[] | null;
  phases: V2Phase[] | null;
  sliding_scale: Array<{ bg_min: number | null; bg_max: number | null; units: number }> | null;
  basis: V2Basis[];
  confidence: 'high' | 'medium' | 'low';
}
export type ClarifyTier = 'law' | 'standard' | 'judgment';
export interface V2Clarify {
  tier: ClarifyTier | null;
  rule_ids: string[];
}
export interface V2Label {
  flag: { needed: boolean; reasons: string[] };
  /** Only on a flagged line. */
  clarify?: V2Clarify;
  likely_reading: V2Reading | null;
  safety_notes: Array<{ code: string; text: string }>;
}
export interface V2Input {
  drug_description: string | null;
  strength: string | null;
  dosage_form: string | null;
  sig: string;
  quantity: { value: number; unit: string };
  days_supply: number;
}
export type LabelStatus = 'confirmed' | 'kevin-notes' | 'proposed';
export interface V2Item {
  id: string;
  tier: 'clean' | 'hard';
  categories: string[];
  label_status: LabelStatus;
  review: { verdict: 'ok' | 'hold' | null; note: string | null };
  source_line: string;
  input: V2Input;
  quantity_role: 'consistent' | 'supports_one_reading' | 'leaves_ambiguous';
  quantity_math: string | null;
  label: V2Label;
  accept?: { drug?: string[]; prn_indication?: string[] };
  open_questions: string[];
  proposal_note: string | null;
  v1_note: string | null;
}

/** The fields of a likely reading that are scored, in report order. Basis and confidence are not. */
export const READING_FIELDS = [
  'drug', 'dosage_form', 'package', 'route', 'laterality', 'concentration', 'dose', 'quantity', 'application_amount',
  'frequency', 'frequency_range', 'timing', 'prn', 'prn_indication', 'prn_interval',
  'max_daily_dose', 'max_doses_per_day', 'max_doses_in_window', 'max_repeats',
  'duration_days', 'weekly', 'phases', 'sliding_scale',
] as const;
export type ReadingField = (typeof READING_FIELDS)[number];

/** Flag reasons that a reply cannot be expected to name. Left out of reason recall. */
export const UNSCORED_REASONS: ReadonlySet<string> = new Set(['reviewer_hold']);

// ─── Comparisons ──────────────────────────────────────────────────────────────

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const isNullish = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const emptyList = (v: unknown) => isNullish(v) || (Array.isArray(v) && v.length === 0);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

const MASS_IN_MCG: Record<string, number> = { mcg: 1, mg: 1_000, g: 1_000_000 };
const EXTRA_DOSE_UNITS: Record<string, string> = { meq: 'mEq', unit: 'units', units: 'units', u: 'units' };

/** Canonical dose unit: v3's units first, then mEq. Null when unknown. */
export function doseUnit(unit: unknown): string | null {
  const v3 = normalizeUnitV3(unit);
  if (v3) return v3;
  if (typeof unit !== 'string') return null;
  return EXTRA_DOSE_UNITS[unit.normalize('NFKC').trim().toLowerCase()] ?? null;
}

/** An amount in a common base: mass in mcg, otherwise the unit itself. Null when the unit is unknown. */
function base(value: unknown, unit: unknown): { v: number; u: string } | null {
  const n = strictNumber(value);
  const u = doseUnit(unit);
  if (n === null || !u) return null;
  if (u in MASS_IN_MCG) return { v: n * MASS_IN_MCG[u], u: 'mcg' };
  return { v: n, u };
}

const QUANTITY_UNITS: Record<string, string> = {
  tab: 'tab', tabs: 'tab', tablet: 'tab', tablets: 'tab',
  cap: 'cap', caps: 'cap', capsule: 'cap', capsules: 'cap',
  ml: 'mL',
  gtt: 'gtt', gtts: 'gtt', drop: 'gtt', drops: 'gtt',
  puff: 'puff', puffs: 'puff', actuation: 'puff', actuations: 'puff',
  spray: 'spray', sprays: 'spray',
  unit: 'unit', units: 'unit', u: 'unit',
  application: 'application', applications: 'application',
  patch: 'patch', patches: 'patch',
  supp: 'supp', supps: 'supp', suppository: 'supp', suppositories: 'supp',
};

export function quantityUnit(unit: unknown): string | null {
  if (typeof unit !== 'string') return null;
  return QUANTITY_UNITS[unit.normalize('NFKC').trim().toLowerCase()] ?? null;
}

/** A dose range against the gold. Mass units convert. A bare amount {value, unit} counts as a fixed dose. */
export function doseRangeMatches(pred: unknown, gold: Range | null): boolean {
  if (gold === null) return isNullish(pred);
  const p = obj(pred);
  if (!p) return false;
  const lo = base('min' in p ? p.min : p.value, p.unit);
  const hi = base('max' in p ? p.max : p.value, p.unit);
  const glo = base(gold.min, gold.unit);
  const ghi = base(gold.max, gold.unit);
  return !!lo && !!hi && !!glo && !!ghi && lo.u === glo.u && hi.u === ghi.u && close(lo.v, glo.v) && close(hi.v, ghi.v);
}

export function quantityRangeMatches(pred: unknown, gold: Range | null): boolean {
  if (gold === null) return isNullish(pred);
  const p = obj(pred);
  if (!p) return false;
  const lo = strictNumber('min' in p ? p.min : p.value);
  const hi = strictNumber('max' in p ? p.max : p.value);
  return lo !== null && hi !== null && quantityUnit(p.unit) === quantityUnit(gold.unit) && close(lo, gold.min) && close(hi, gold.max);
}

function amountMatches(pred: unknown, gold: Amount | null): boolean {
  if (gold === null) return isNullish(pred);
  const p = obj(pred);
  if (!p) return false;
  const a = base(p.value, p.unit);
  const g = base(gold.value, gold.unit);
  return !!a && !!g && a.u === g.u && close(a.v, g.v);
}

const PER_UNITS: Record<string, string> = { ml: 'mL', puff: 'puff', actuation: 'puff', act: 'puff', spray: 'spray' };

/**
 * A concentration as amount per one measured unit, with mass in mcg. A percent is read as grams per
 * 100 mL, so 0.5% equals 5 mg/mL and either way of writing it matches.
 */
export function concentrationKey(c: unknown): { v: number; u: string } | null {
  const p = obj(c);
  if (!p) return null;
  const percent = strictNumber(p.percent);
  if (percent !== null) return { v: percent * 10_000, u: 'mcg/mL' };
  const a = obj(p.amount);
  const per = obj(p.per);
  if (!a || !per) return null;
  const amt = base(a.value, a.unit);
  const n = strictNumber(per.value);
  const pu = typeof per.unit === 'string' ? PER_UNITS[per.unit.trim().toLowerCase()] : undefined;
  if (!amt || n === null || n === 0 || !pu) return null;
  return { v: amt.v / n, u: `${amt.u}/${pu}` };
}

function concentrationMatches(pred: unknown, gold: Concentration | null): boolean {
  if (gold === null) return isNullish(pred);
  const a = concentrationKey(pred);
  const g = concentrationKey(gold);
  return !!a && !!g && a.u === g.u && close(a.v, g.v);
}

function numberMatches(pred: unknown, gold: number | null): boolean {
  if (gold === null) return isNullish(pred);
  const n = strictNumber(pred);
  return n !== null && close(n, gold);
}

function wordMatches(pred: unknown, gold: string | null): boolean {
  if (gold === null) return isNullish(pred);
  return typeof pred === 'string' && pred.trim().toLowerCase().replace(/[\s-]+/g, '_') === gold;
}

const MINUTES: Record<string, number> = { min: 1, h: 60 };

function spanMatches(pred: unknown, gold: { min: number; max: number; unit: string } | null): boolean {
  if (gold === null) return isNullish(pred);
  const p = obj(pred);
  if (!p) return false;
  const per = typeof p.unit === 'string' ? MINUTES[p.unit.trim().toLowerCase()] : undefined;
  const lo = strictNumber(p.min);
  const hi = strictNumber(p.max);
  return !!per && lo !== null && hi !== null && close(lo * per, gold.min * MINUTES[gold.unit]) && close(hi * per, gold.max * MINUTES[gold.unit]);
}

function windowMatches(pred: unknown, gold: V2Limits['max_doses_in_window']): boolean {
  if (gold === null) return isNullish(pred);
  const p = obj(pred);
  const w = p && obj(p.window);
  if (!p || !w) return false;
  const per = typeof w.unit === 'string' ? MINUTES[w.unit.trim().toLowerCase()] : undefined;
  const n = strictNumber(w.value);
  return numberMatches(p.count, gold.count) && !!per && n !== null && close(n * per, gold.window.value * MINUTES[gold.window.unit]);
}

function frequencyRangeMatches(pred: unknown, gold: V2Reading['frequency_range']): boolean {
  if (gold === null) return isNullish(pred);
  const p = obj(pred);
  return !!p && numberMatches(p.min, gold.min) && numberMatches(p.max, gold.max) && wordMatches(p.per ?? 'day', gold.per);
}

function applicationMatches(pred: unknown, gold: V2Reading['application_amount']): boolean {
  if (gold === null) return isNullish(pred);
  const p = obj(pred);
  if (!p || !wordMatches(p.qualifier, gold.qualifier)) return false;
  if (gold.length === null) return isNullish(p.length);
  const l = obj(p.length);
  const inCm = (v: number, u: string) => (u === 'inch' ? v * 2.54 : v);
  const n = l ? strictNumber(l.value) : null;
  const u = l && typeof l.unit === 'string' ? l.unit.trim().toLowerCase().replace(/es$/, '') : '';
  return n !== null && (u === 'inch' || u === 'cm') && close(inCm(n, u), inCm(gold.length.value, gold.length.unit));
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
function dayOf(word: unknown): string | null {
  if (typeof word !== 'string') return null;
  const w = word.trim().toLowerCase();
  return DAYS.find((d) => d === w || (w.length >= 3 && d.startsWith(w))) ?? null;
}

/**
 * The weekday pattern of a reading as one map, weekday to dose (in a common base). Built from
 * weekly_schedule, or from days_of_week with the top-level dose. Null when the reading names no
 * weekday. "Invalid" when a weekday or dose cannot be read.
 */
export function weekdayMap(r: Record<string, unknown>): Map<string, string> | null | 'invalid' {
  const out = new Map<string, string>();
  const key = (d: unknown) => {
    const p = obj(d);
    if (!p) return 'none';
    const lo = base('min' in p ? p.min : p.value, p.unit);
    const hi = base('max' in p ? p.max : p.value, p.unit);
    return lo && hi ? `${lo.v}-${hi.v} ${lo.u}` : 'bad';
  };
  const add = (days: unknown, dose: unknown): boolean => {
    if (!Array.isArray(days)) return false;
    for (const d of days) {
      const day = dayOf(d);
      const k = key(dose);
      if (!day || k === 'bad' || out.has(day)) return false;
      out.set(day, k);
    }
    return true;
  };
  if (Array.isArray(r.weekly_schedule) && r.weekly_schedule.length) {
    for (const e of r.weekly_schedule) {
      const p = obj(e);
      if (!p || !add(p.days, p.dose)) return 'invalid';
    }
  }
  if (Array.isArray(r.days_of_week) && r.days_of_week.length) {
    if (!add(r.days_of_week, r.dose)) return 'invalid';
  }
  return out.size ? out : null;
}

function weeklyMatches(pred: Record<string, unknown>, gold: V2Reading): boolean {
  const g = weekdayMap(gold as unknown as Record<string, unknown>);
  const p = weekdayMap(pred);
  if (g === null) return p === null;
  if (p === null || p === 'invalid' || g === 'invalid') return false;
  return g.size === p.size && [...g].every(([d, k]) => p.get(d) === k);
}

function phaseMatches(pred: unknown, gold: V2Phase): boolean {
  const p = obj(pred);
  return (
    !!p &&
    doseRangeMatches(p.dose, gold.dose) &&
    quantityRangeMatches(p.quantity, gold.quantity) &&
    normalizeLabel(p.frequency) === normalizeLabel(gold.frequency) &&
    normalizeLabel(p.timing) === normalizeLabel(gold.timing) &&
    numberMatches(p.days, gold.days)
  );
}

function phasesMatch(pred: unknown, gold: V2Phase[] | null): boolean {
  if (gold === null) return emptyList(pred);
  return Array.isArray(pred) && pred.length === gold.length && gold.every((g, i) => phaseMatches(pred[i], g));
}

function scaleMatches(pred: unknown, gold: V2Reading['sliding_scale']): boolean {
  if (gold === null) return emptyList(pred);
  if (!Array.isArray(pred) || pred.length !== gold.length) return false;
  const k = (s: unknown) => strictNumber(obj(s)?.bg_min) ?? -Infinity;
  const a = [...pred].sort((x, y) => k(x) - k(y));
  const b = [...gold].sort((x, y) => k(x) - k(y));
  return b.every((g, i) => {
    const p = obj(a[i]);
    return !!p && numberMatches(p.bg_min, g.bg_min) && numberMatches(p.bg_max, g.bg_max) && numberMatches(p.units, g.units);
  });
}

/** The full line the model saw, used to accept a salt or form word the line itself names. */
export function renderLine(input: V2Input): string {
  return [input.drug_description, input.strength, input.dosage_form, input.sig].filter((x) => x).join(' ');
}

function drugOk(pred: unknown, gold: string | null, item: V2Item): boolean {
  if (gold === null) return isNullish(pred);
  return [gold, ...(item.accept?.drug ?? [])].some((d) => drugMatches(pred, d, renderLine(item.input)));
}

function reasonOk(pred: unknown, gold: string | null, item: V2Item): boolean {
  if (gold === null) return reasonMatches(pred, null);
  return [gold, ...(item.accept?.prn_indication ?? [])].some((r) => reasonMatches(pred, r));
}

/** Per field: does the reply's likely reading match the gold likely reading? */
export function readingFields(item: V2Item, pred: unknown, gold: V2Reading): Record<ReadingField, boolean> {
  const p = obj(pred);
  if (!p) return Object.fromEntries(READING_FIELDS.map((f) => [f, false])) as Record<ReadingField, boolean>;
  const lim = obj(p.limits) ?? {};
  return {
    drug: drugOk(p.drug, gold.drug, item),
    dosage_form: wordMatches(p.dosage_form, gold.dosage_form),
    package: wordMatches(p.package, gold.package),
    route: wordMatches(p.route, gold.route),
    laterality: wordMatches(p.laterality, gold.laterality),
    concentration: concentrationMatches(p.concentration, gold.concentration),
    dose: doseRangeMatches(p.dose, gold.dose),
    quantity: quantityRangeMatches(p.quantity, gold.quantity),
    application_amount: applicationMatches(p.application_amount, gold.application_amount),
    frequency: normalizeLabel(p.frequency) === normalizeLabel(gold.frequency),
    frequency_range: frequencyRangeMatches(p.frequency_range, gold.frequency_range),
    timing: normalizeLabel(p.timing) === normalizeLabel(gold.timing),
    prn: p.prn === gold.prn,
    prn_indication: reasonOk(p.prn_indication, gold.prn_indication, item),
    prn_interval: spanMatches(p.prn_interval, gold.prn_interval),
    max_daily_dose: amountMatches(lim.max_daily_dose, gold.limits.max_daily_dose),
    max_doses_per_day: numberMatches(lim.max_doses_per_day, gold.limits.max_doses_per_day),
    max_doses_in_window: windowMatches(lim.max_doses_in_window, gold.limits.max_doses_in_window),
    max_repeats: numberMatches(lim.max_repeats, gold.limits.max_repeats),
    duration_days: numberMatches(p.duration_days, gold.duration_days),
    weekly: weeklyMatches(p, gold),
    phases: phasesMatch(p.phases, gold.phases),
    sliding_scale: scaleMatches(p.sliding_scale, gold.sliding_scale),
  };
}

// ─── Score one reply ──────────────────────────────────────────────────────────

export interface V2Score {
  id: string;
  parsed: boolean;
  /** Tier 1. */
  flag: { gold: boolean; reply: boolean | null; correct: boolean; reasonsExpected: number; reasonsNamed: number };
  /** Tier 2. Null when the label has no likely reading, so the item is not scored on this tier. */
  reading: { offered: boolean; fields: Record<ReadingField, boolean>; allCorrect: boolean } | null;
  /** True when the label has no likely reading and the reply offered one anyway. Reported, not scored. */
  readingOfferedWithoutGold: boolean;
  safety: { expected: number; named: number };
  /** Tier 3. Null when the label is not flagged or names no tier. */
  tier: { gold: ClarifyTier; reply: string | null; correct: boolean } | null;
  /** The label has a likely reading and a law or standard tier: a call is required before dispensing. */
  callRequiredWithReading: boolean;
}

/** True when the label has a likely reading but law or a standard requires a call before dispensing. */
export function callRequiredWithReading(label: V2Label): boolean {
  return !!label.likely_reading && (label.clarify?.tier === 'law' || label.clarify?.tier === 'standard');
}

function tierScore(gold: V2Label, reply: Record<string, unknown> | null): V2Score['tier'] {
  const g = gold.flag.needed ? gold.clarify?.tier ?? null : null;
  if (!g) return null;
  const c = reply ? obj(reply.clarify) : null;
  const t = c && typeof c.tier === 'string' ? c.tier.trim().toLowerCase() : null;
  return { gold: g, reply: t, correct: t === g };
}

export function scoreV2Reply(item: V2Item, replyText: string): V2Score {
  const g = item.label;
  const scored = new Set(g.flag.reasons.filter((r) => !UNSCORED_REASONS.has(r)));
  const goldCodes = new Set(g.safety_notes.map((n) => n.code));
  const { value } = parsePredictionV3(replyText);
  const p = obj(value);
  const noFields = Object.fromEntries(READING_FIELDS.map((f) => [f, false])) as Record<ReadingField, boolean>;
  if (!p) {
    return {
      id: item.id,
      parsed: false,
      flag: { gold: g.flag.needed, reply: null, correct: false, reasonsExpected: scored.size, reasonsNamed: 0 },
      reading: g.likely_reading ? { offered: false, fields: noFields, allCorrect: false } : null,
      readingOfferedWithoutGold: false,
      safety: { expected: goldCodes.size, named: 0 },
      tier: tierScore(g, null),
      callRequiredWithReading: callRequiredWithReading(g),
    };
  }
  const f = obj(p.flag);
  const replyNeeded = f && typeof f.needed === 'boolean' ? f.needed : null;
  const replyReasons = new Set(Array.isArray(f?.reasons) ? (f!.reasons as unknown[]).filter((r): r is string => typeof r === 'string') : []);
  const notes = Array.isArray(p.safety_notes) ? (p.safety_notes as unknown[]) : [];
  const replyCodes = new Set(notes.map((n) => obj(n)?.code).filter((c): c is string => typeof c === 'string'));
  const offered = obj(p.likely_reading) !== null;
  let reading: V2Score['reading'] = null;
  if (g.likely_reading) {
    const fields = offered ? readingFields(item, p.likely_reading, g.likely_reading) : noFields;
    reading = { offered, fields, allCorrect: offered && READING_FIELDS.every((k) => fields[k]) };
  }
  return {
    id: item.id,
    parsed: true,
    flag: {
      gold: g.flag.needed,
      reply: replyNeeded,
      correct: replyNeeded === g.flag.needed,
      reasonsExpected: scored.size,
      reasonsNamed: [...scored].filter((r) => replyReasons.has(r)).length,
    },
    reading,
    readingOfferedWithoutGold: !g.likely_reading && offered,
    safety: { expected: goldCodes.size, named: [...goldCodes].filter((c) => replyCodes.has(c)).length },
    tier: tierScore(g, p),
    callRequiredWithReading: callRequiredWithReading(g),
  };
}

// ─── Summaries ────────────────────────────────────────────────────────────────

export interface FlagTally {
  items: number;
  correct: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  unanswered: number;
  reasonsExpected: number;
  reasonsNamed: number;
}
export interface ReadingTally {
  /** Items whose label has a likely reading. */
  items: number;
  offered: number;
  allCorrect: number;
  fields: Record<ReadingField, number>;
  offeredWithoutGold: number;
}
export interface TierTally {
  /** Flagged items whose label names a tier. */
  items: number;
  correct: number;
  unanswered: number;
  byGold: Record<ClarifyTier, { items: number; correct: number }>;
}
export interface CallRequiredTally {
  /** Items with a likely reading where law or a standard requires a call before dispensing. */
  items: number;
  /** Of those, replies that did not flag: they dispensed their best guess. */
  dispensedWithoutCall: number;
  /** Of those, the ones whose guess was fully right. Still wrong to dispense without the call. */
  dispensedWithoutCallGuessRight: number;
}
export interface V2Summary {
  flag: FlagTally;
  reading: ReadingTally;
  safety: { expected: number; named: number };
  tier: TierTally;
  callRequired: CallRequiredTally;
}

export function emptySummary(): V2Summary {
  return {
    flag: { items: 0, correct: 0, truePositive: 0, falsePositive: 0, falseNegative: 0, trueNegative: 0, unanswered: 0, reasonsExpected: 0, reasonsNamed: 0 },
    reading: { items: 0, offered: 0, allCorrect: 0, fields: Object.fromEntries(READING_FIELDS.map((f) => [f, 0])) as Record<ReadingField, number>, offeredWithoutGold: 0 },
    safety: { expected: 0, named: 0 },
    tier: { items: 0, correct: 0, unanswered: 0, byGold: { law: { items: 0, correct: 0 }, standard: { items: 0, correct: 0 }, judgment: { items: 0, correct: 0 } } },
    callRequired: { items: 0, dispensedWithoutCall: 0, dispensedWithoutCallGuessRight: 0 },
  };
}

export function addScore(s: V2Summary, x: V2Score): void {
  const f = s.flag;
  f.items++;
  if (x.flag.correct) f.correct++;
  if (x.flag.reply === null) f.unanswered++;
  else if (x.flag.gold && x.flag.reply) f.truePositive++;
  else if (!x.flag.gold && x.flag.reply) f.falsePositive++;
  else if (x.flag.gold && !x.flag.reply) f.falseNegative++;
  else f.trueNegative++;
  f.reasonsExpected += x.flag.reasonsExpected;
  f.reasonsNamed += x.flag.reasonsNamed;
  if (x.reading) {
    s.reading.items++;
    if (x.reading.offered) s.reading.offered++;
    if (x.reading.allCorrect) s.reading.allCorrect++;
    for (const k of READING_FIELDS) if (x.reading.fields[k]) s.reading.fields[k]++;
  }
  if (x.readingOfferedWithoutGold) s.reading.offeredWithoutGold++;
  s.safety.expected += x.safety.expected;
  s.safety.named += x.safety.named;
  if (x.tier) {
    s.tier.items++;
    s.tier.byGold[x.tier.gold].items++;
    if (x.tier.reply === null) s.tier.unanswered++;
    if (x.tier.correct) {
      s.tier.correct++;
      s.tier.byGold[x.tier.gold].correct++;
    }
  }
  if (x.callRequiredWithReading) {
    s.callRequired.items++;
    if (x.flag.reply !== true) {
      s.callRequired.dispensedWithoutCall++;
      if (x.reading?.allCorrect) s.callRequired.dispensedWithoutCallGuessRight++;
    }
  }
}
