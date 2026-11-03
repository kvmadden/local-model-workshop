/**
 * Scorer v3 for the medication-instruction extraction eval (eval/sig-extraction).
 *
 * src/eval/sigScore.ts is the v2 scorer. It produced every committed verdict, so it stays
 * unchanged and keeps reproducing them. This file is the scorer for new runs.
 *
 * What v3 changes, and why:
 * - Drug. v2 passed any reply that contained the gold token, so copying the whole input line,
 *   "not warfarin" or "metoprolol succinate" for metoprolol tartrate all scored as correct.
 *   v3 needs every gold token, and allows an extra token only when it is a known salt, release
 *   or dosage-form word that the input line itself contains ("Hydroxyzine HCl" still passes).
 * - As-needed reason. v2 passed "chest pain" for gold "pain" and "no chest pain" for
 *   "chest pain". v3 compares the words exactly after removing a closed list of filler words.
 * - Dose. g, mg and mcg are converted before comparing, so 1 g equals 1000 mg. A numeric string
 *   must be a plain decimal ("0x0A" is no longer read as 10).
 * - Both sides are tokenized the same way, so hyphens and digits in names work ("vitamin d3").
 * - Parsing finds balanced JSON objects and takes the last valid one. How the object was found
 *   is reported, and schema problems are reported separately from field correctness.
 *
 * Pure functions, no I/O.
 */
import type { SigGold, SigPrediction, SigField } from './sigScore';
import { SIG_FIELDS, normalizeLabel } from './sigScore';

export const SCORER_VERSION = 'sig-v3';

/** Lowercase word tokens. Letters and digits only, the same rule for gold and reply. */
export function wordTokens(text: string): string[] {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * Words that can follow a drug name without naming a different drug: salts, esters, release
 * forms and dosage forms. An extra word in the reply counts only if the input line uses it too.
 */
export const NAME_QUALIFIERS: ReadonlySet<string> = new Set([
  'hcl', 'hydrochloride', 'hbr', 'hydrobromide', 'sodium', 'potassium', 'calcium', 'magnesium',
  'besylate', 'maleate', 'mesylate', 'citrate', 'sulfate', 'phosphate', 'acetate', 'tartrate',
  'bitartrate', 'succinate', 'fumarate', 'propionate', 'dipropionate', 'furoate', 'valerate',
  'hyclate', 'monohydrate', 'trihydrate',
  'er', 'xr', 'sr', 'xl', 'la', 'cr', 'dr', 'ec', 'ir', 'odt', 'hfa',
  'tab', 'tabs', 'tablet', 'tablets', 'cap', 'caps', 'capsule', 'capsules', 'solution',
  'suspension', 'syrup', 'elixir', 'oral', 'nasal', 'spray', 'inhaler', 'patch', 'cream',
  'ointment', 'gel', 'drops', 'injection',
]);

/** Words removed before comparing an as-needed reason. Nothing that can change the meaning. */
export const REASON_FILLER: ReadonlySet<string> = new Set([
  'for', 'of', 'the', 'a', 'an', 'to', 'in', 'as', 'needed', 'prn', 'if', 'when',
]);

export function drugMatches(pred: unknown, goldDrug: string, input: string): boolean {
  if (typeof pred !== 'string') return false;
  const reply = wordTokens(pred);
  const gold = wordTokens(goldDrug);
  if (reply.length === 0 || gold.length === 0) return false;
  const replySet = new Set(reply);
  if (!gold.every((t) => replySet.has(t))) return false;
  const goldSet = new Set(gold);
  const inputSet = new Set(wordTokens(input));
  return reply.every((t) => goldSet.has(t) || (NAME_QUALIFIERS.has(t) && inputSet.has(t)));
}

export function reasonMatches(pred: unknown, gold: string | null): boolean {
  if (gold === null) return pred === null || (typeof pred === 'string' && pred.trim() === '');
  if (typeof pred !== 'string') return false;
  const reply = new Set(wordTokens(pred).filter((t) => !REASON_FILLER.has(t)));
  const want = new Set(wordTokens(gold).filter((t) => !REASON_FILLER.has(t)));
  if (reply.size === 0 || reply.size !== want.size) return false;
  return [...want].every((t) => reply.has(t));
}

const UNIT_ALIASES_V3: Record<string, string> = {
  mg: 'mg', milligram: 'mg', milligrams: 'mg',
  mcg: 'mcg', ug: 'mcg', 'μg': 'mcg', microgram: 'mcg', micrograms: 'mcg',
  g: 'g', gram: 'g', grams: 'g',
  unit: 'units', units: 'units',
  ml: 'mL', milliliter: 'mL', milliliters: 'mL', millilitre: 'mL', millilitres: 'mL', cc: 'mL',
};

/**
 * Canonical unit, or null. "u" is left out on purpose: it is on the Joint Commission
 * do-not-use list. "IU" is not mapped to "units", so it fails closed.
 */
export function normalizeUnitV3(unit: unknown): string | null {
  if (typeof unit !== 'string') return null;
  // NFKC folds the micro sign into the Greek letter mu, so both spellings of mcg match.
  return UNIT_ALIASES_V3[unit.normalize('NFKC').trim().toLowerCase()] ?? null;
}

const MASS_IN_MCG: Record<string, number> = { mcg: 1, mg: 1_000, g: 1_000_000 };

/** A finite number, or a string that is a plain decimal. Anything else is null. */
export function strictNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*$/.test(value)) return Number(value);
  return null;
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

export function doseMatchesV3(pred: unknown, gold: SigGold['dose_per_administration']): boolean {
  if (!pred || typeof pred !== 'object' || Array.isArray(pred)) return false;
  const { value, unit } = pred as { value?: unknown; unit?: unknown };
  const amount = strictNumber(value);
  const replyUnit = normalizeUnitV3(unit);
  if (amount === null || replyUnit === null) return false;
  if (replyUnit in MASS_IN_MCG && gold.unit in MASS_IN_MCG) {
    return close(amount * MASS_IN_MCG[replyUnit], gold.value * MASS_IN_MCG[gold.unit]);
  }
  return replyUnit === gold.unit && close(amount, gold.value);
}

export type ParseHow = 'direct' | 'embedded' | 'last-of-several' | 'none';

/** Top-level balanced {...} substrings, ignoring braces inside JSON strings. */
export function balancedObjects(text: string): string[] {
  const found: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      if (depth > 0) inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        found.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return found;
}

const asObject = (s: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Parses a reply. Takes the whole reply when it is an object, else the last valid embedded object. */
export function parsePredictionV3(text: string): { value: SigPrediction | null; how: ParseHow } {
  const direct = asObject(text.trim());
  if (direct) return { value: direct as SigPrediction, how: 'direct' };
  const objects = balancedObjects(text).map(asObject).filter((v): v is Record<string, unknown> => v !== null);
  if (objects.length === 0) return { value: null, how: 'none' };
  return { value: objects[objects.length - 1] as SigPrediction, how: objects.length === 1 ? 'embedded' : 'last-of-several' };
}

type Schema = {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
};

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/**
 * Problems with a parsed reply against the subset of JSON Schema the eval schemas use
 * (type, enum, properties, required, additionalProperties). Empty means it conforms.
 * Keys the schema does not name are listed too, because an extra field is extra output.
 */
export function schemaProblems(value: unknown, schema: Schema, path = '$'): string[] {
  const problems: string[] = [];
  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const ok = allowed.some((t) => t === actual || (t === 'integer' && actual === 'number' && Number.isInteger(value)));
    if (!ok) problems.push(`${path}: expected ${allowed.join(' or ')}, got ${actual}`);
  }
  if (schema.enum && !schema.enum.some((e) => e === value)) problems.push(`${path}: ${JSON.stringify(value)} is not an allowed value`);
  if (schema.properties && value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in obj)) problems.push(`${path}.${key}: missing`);
    for (const [key, sub] of Object.entries(schema.properties)) if (key in obj) problems.push(...schemaProblems(obj[key], sub, `${path}.${key}`));
    for (const key of Object.keys(obj)) if (!(key in schema.properties)) problems.push(`${path}.${key}: not in the schema`);
  }
  return problems;
}

export type SigCaseScoreV3 = { id: string; parsed: boolean; allCorrect: boolean; parseHow: ParseHow; schemaProblems: string[] } & Record<SigField, boolean>;

/**
 * Scores one reply. `input` is the instruction line the model saw. It is needed to tell an
 * extra word the line itself uses (a salt, a dosage form) from an invented one.
 */
export function scoreCaseV3(gold: SigGold, replyText: string, input: string, schema?: Schema): SigCaseScoreV3 {
  const { value: pred, how } = parsePredictionV3(replyText);
  if (!pred) {
    const none = Object.fromEntries(SIG_FIELDS.map((k) => [k, false])) as Record<SigField, boolean>;
    return { id: gold.id, parsed: false, allCorrect: false, parseHow: how, schemaProblems: ['$: no JSON object found'], ...none };
  }
  const fields: Record<SigField, boolean> = {
    drug: drugMatches(pred.drug, gold.drug, input),
    dose: doseMatchesV3(pred.dose_per_administration, gold.dose_per_administration),
    frequency: normalizeLabel(pred.frequency) === gold.frequency,
    timing: normalizeLabel(pred.timing) === gold.timing,
    prn: pred.prn === gold.prn,
    prn_indication: reasonMatches(pred.prn_indication, gold.prn_indication),
  };
  return {
    id: gold.id,
    parsed: true,
    parseHow: how,
    schemaProblems: schema ? schemaProblems(pred, schema) : [],
    ...fields,
    allCorrect: SIG_FIELDS.every((k) => fields[k]),
  };
}

export type SigSummaryV3 = { n: number; parsed: number; schemaValid: number; allCorrect: number } & Record<SigField, number>;

export function summarizeV3(scores: SigCaseScoreV3[]): SigSummaryV3 {
  const count = (pick: (s: SigCaseScoreV3) => boolean) => scores.filter(pick).length;
  const fields = Object.fromEntries(SIG_FIELDS.map((k) => [k, count((s) => s[k])])) as Record<SigField, number>;
  return {
    n: scores.length,
    parsed: count((s) => s.parsed),
    schemaValid: count((s) => s.parsed && s.schemaProblems.length === 0),
    ...fields,
    allCorrect: count((s) => s.allCorrect),
  };
}
