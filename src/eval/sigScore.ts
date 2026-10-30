/**
 * Scoring for the medication-instruction extraction eval (eval/sig-extraction).
 *
 * Schedule, time of day and as-needed use are scored as separate fields, so
 * "as needed", "once a day" and "once a day as needed" are three different answers.
 *
 * Pure functions, no I/O, so the scorer itself is unit tested.
 */

export interface SigGold {
  id: string;
  drug: string;
  /** Lowercase token(s) that must appear, as whole words, in the predicted drug name. */
  drug_match: string;
  dose_per_administration: { value: number; unit: string };
  /** Schedule label, or null when the line gives no schedule (as needed only). */
  frequency: string | null;
  /** Time of day or meal anchor, or null when the line gives none. */
  timing: string | null;
  prn: boolean;
  /** Reason for as-needed use, or null when none is stated. */
  prn_indication: string | null;
}

export interface SigPrediction {
  drug?: unknown;
  dose_per_administration?: unknown;
  frequency?: unknown;
  timing?: unknown;
  prn?: unknown;
  prn_indication?: unknown;
}

/** The scored fields, in report order. */
export const SIG_FIELDS = ['drug', 'dose', 'frequency', 'timing', 'prn', 'prn_indication'] as const;
export type SigField = (typeof SIG_FIELDS)[number];

export type SigCaseScore = { id: string; parsed: boolean; allCorrect: boolean } & Record<SigField, boolean>;

/** Parses a model reply into an object. Accepts bare JSON or the first {...} block in prose. */
export function parsePrediction(text: string): SigPrediction | null {
  const tryParse = (s: string): SigPrediction | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as SigPrediction) : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(text.trim());
  if (direct) return direct;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return tryParse(text.slice(start, end + 1));
  return null;
}

const UNIT_ALIASES: Record<string, string> = {
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  mcg: 'mcg',
  ug: 'mcg',
  'µg': 'mcg',
  microgram: 'mcg',
  micrograms: 'mcg',
  g: 'g',
  gram: 'g',
  grams: 'g',
  unit: 'units',
  units: 'units',
  u: 'units',
  ml: 'mL',
};

export function normalizeUnit(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  return UNIT_ALIASES[u.trim().toLowerCase()] ?? null;
}

/**
 * Normalizes a closed-vocabulary label ("every 12 hours" -> "every_12_hours").
 * JSON null stays null. Anything that is not a string or null returns undefined,
 * which never equals a gold value.
 */
export function normalizeLabel(f: unknown): string | null | undefined {
  if (f === null) return null;
  if (typeof f !== 'string') return undefined;
  return f.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** True when every token of `match` appears as a whole word in `pred`. */
function wordsMatch(pred: unknown, match: string): boolean {
  if (typeof pred !== 'string') return false;
  const words = new Set(pred.toLowerCase().split(/[^a-z]+/).filter(Boolean));
  return match
    .toLowerCase()
    .split(/\s+/)
    .every((w) => words.has(w));
}

function doseMatches(pred: unknown, gold: SigGold['dose_per_administration']): boolean {
  if (!pred || typeof pred !== 'object' || Array.isArray(pred)) return false;
  const { value, unit } = pred as { value?: unknown; unit?: unknown };
  const v = toNumber(value);
  return v !== null && Math.abs(v - gold.value) < 1e-6 && normalizeUnit(unit) === gold.unit;
}

function indicationMatches(pred: unknown, gold: string | null): boolean {
  // An empty string means "none given", same as null.
  const p = typeof pred === 'string' && pred.trim() === '' ? null : pred;
  if (gold === null) return p === null;
  return wordsMatch(p, gold);
}

export function scoreCase(gold: SigGold, replyText: string): SigCaseScore {
  const pred = parsePrediction(replyText);
  if (!pred) {
    return {
      id: gold.id,
      parsed: false,
      drug: false,
      dose: false,
      frequency: false,
      timing: false,
      prn: false,
      prn_indication: false,
      allCorrect: false,
    };
  }
  const fields: Record<SigField, boolean> = {
    drug: wordsMatch(pred.drug, gold.drug_match),
    dose: doseMatches(pred.dose_per_administration, gold.dose_per_administration),
    frequency: normalizeLabel(pred.frequency) === gold.frequency,
    timing: normalizeLabel(pred.timing) === gold.timing,
    prn: pred.prn === gold.prn,
    prn_indication: indicationMatches(pred.prn_indication, gold.prn_indication),
  };
  return { id: gold.id, parsed: true, ...fields, allCorrect: SIG_FIELDS.every((k) => fields[k]) };
}

/** Nearest-rank percentile. `p` in (0, 100]. Returns null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export type SigSummary = { n: number; parsed: number; allCorrect: number } & Record<SigField, number>;

export function summarize(scores: SigCaseScore[]): SigSummary {
  const count = (k: keyof SigCaseScore) => scores.filter((s) => s[k] === true).length;
  const fields = Object.fromEntries(SIG_FIELDS.map((k) => [k, count(k)])) as Record<SigField, number>;
  return { n: scores.length, parsed: count('parsed'), ...fields, allCorrect: count('allCorrect') };
}
