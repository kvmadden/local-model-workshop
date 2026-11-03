/**
 * Scorer v3 for the medication-instruction extraction eval (eval/sig-extraction).
 *
 * src/eval/sigScore.ts is the v2 scorer. It produced every committed verdict, so it stays
 * unchanged and keeps reproducing them. This file is the scorer for new runs.
 *
 * What v3 changes, and why:
 * - Drug. v2 passed any reply that contained the gold token, so copying the whole input line,
 *   "not warfarin" or "metoprolol succinate" for metoprolol tartrate all scored as correct.
 *   v3 needs every gold word. An extra word passes only if it is a salt, release or dosage-form
 *   word in this drug's own description on the line: the words from its first mention that is
 *   not negated, up to the first word that is not part of a name, salt, form or strength, within
 *   the same clause. So "Hydroxyzine HCl" passes for "Hydroxyzine HCl 25 mg tab", and "metformin
 *   ER" fails for "Metformin 500 mg (not ER)". Spellings of one salt or form count as the same
 *   word (HCl and hydrochloride, ER and extended release, tab and tablets). Different salts and
 *   different release forms stay different. A digit in a name matches however it is joined
 *   ("vitamin D3", "vitamin D-3").
 * - As-needed reason. v2 passed "chest pain" for gold "pain" and "no chest pain" for
 *   "chest pain". v3 compares the reason word for word, in order. Only wrapper words around it
 *   are removed ("as needed for", "PRN", "for", "if", "when"). "&" and "and" are the same, and
 *   so are "break-through" and "breakthrough".
 * - Dose. g, mg and mcg are converted before comparing, so 1 g equals 1000 mg. The gold unit is
 *   read the same way as the reply unit, and an unknown gold unit is an error. A numeric string
 *   must be a plain decimal ("0x0A" is no longer read as 10), and amounts must stay finite.
 * - Parsing takes the whole reply when it is one JSON object, or the one object embedded in it.
 *   A reply with several objects is ambiguous and is not scored. How the object was found is
 *   reported, and schema problems are reported separately from field correctness.
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
 * Salts, esters and release forms. Each changes which product is meant, so one counts only when it
 * is part of this drug's own description on the line.
 */
export const IDENTITY_QUALIFIERS: ReadonlySet<string> = new Set([
  'hcl', 'hbr', 'sodium', 'potassium', 'calcium', 'magnesium',
  'besylate', 'maleate', 'mesylate', 'citrate', 'sulfate', 'phosphate', 'acetate', 'tartrate',
  'bitartrate', 'succinate', 'fumarate', 'propionate', 'dipropionate', 'furoate', 'valerate',
  'hyclate', 'monohydrate', 'trihydrate',
  'er', 'xr', 'sr', 'xl', 'la', 'cr', 'dr', 'ec', 'ir',
]);

/** Dosage forms and routes that can be written next to a drug name. */
export const FORM_WORDS: ReadonlySet<string> = new Set([
  'odt', 'hfa', 'tablet', 'capsule', 'solution', 'suspension', 'syrup', 'elixir', 'oral', 'nasal',
  'spray', 'inhaler', 'patch', 'cream', 'ointment', 'gel', 'drops', 'injection', 'sublingual',
  'topical', 'ophthalmic', 'otic', 'transdermal', 'rectal', 'vaginal',
]);

/** Words of a strength that can sit inside a drug's description ("Metformin 500 mg ER tablet"). */
const STRENGTH_WORDS: ReadonlySet<string> = new Set(['mg', 'mcg', 'ug', 'g', 'ml', 'l', 'unit', 'units', 'iu', 'meq', 'mmol', 'actuation']);

/** Words that put the drug mention after them out of the instruction ("not metoprolol succinate"). */
const NEGATION_CUES: ReadonlySet<string> = new Set(['not', 'no', 'never', 'avoid', 'instead', 'rather', 'without', 'except', 'stop', 'discontinue', 'dont']);

/** Spellings of one salt, release form or dosage form. Different salts and forms stay different. */
const RELEASE_PHRASES: Array<[RegExp, string]> = [
  [/\bextended release\b/g, 'er'],
  [/\bdelayed release\b/g, 'dr'],
  [/\bimmediate release\b/g, 'ir'],
  [/\benteric coated\b/g, 'ec'],
  [/\borally disintegrating\b/g, 'odt'],
];
const SPELLINGS: Record<string, string> = {
  hydrochloride: 'hcl', hydrobromide: 'hbr',
  tab: 'tablet', tabs: 'tablet', tablets: 'tablet',
  cap: 'capsule', caps: 'capsule', capsules: 'capsule',
  drop: 'drops', sprays: 'spray', inhalers: 'inhaler', patches: 'patch', injections: 'injection',
};

/**
 * Tokens for comparing drug names. Letters and digits are split apart ("d3" and "d-3" both give
 * "d", "3"), and each spelling of a salt or form becomes one word.
 */
export function drugTokens(text: string): string[] {
  let t = ` ${text.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  t = t.replace(/([a-z])(?=\d)/g, '$1 ').replace(/(\d)(?=[a-z])/g, '$1 ');
  for (const [pattern, word] of RELEASE_PHRASES) t = t.replace(pattern, word);
  return t.trim().split(/\s+/).filter(Boolean).map((w) => SPELLINGS[w] ?? w);
}

/** Pieces of a line that cannot share a drug description: split at commas, colons, brackets, spaced dashes and sentence ends. */
const CLAUSE_BREAK = /[,;:()[\]{}\n]|\s[-–—]+\s|\.(?:\s|$)/;

/**
 * The salt, release and form words in this drug's own description on the line. The description
 * starts at the first mention of the gold name that no negation word precedes, and runs while the
 * words are part of a name, salt, form or strength, within one clause. Empty when the line never
 * names the drug.
 */
export function ownQualifiers(goldDrug: string, input: string): Set<string> {
  const name = drugTokens(goldDrug);
  const allowed = new Set<string>();
  if (name.length === 0) return allowed;
  const inDescription = (w: string) => IDENTITY_QUALIFIERS.has(w) || FORM_WORDS.has(w) || STRENGTH_WORDS.has(w) || /^\d+$/.test(w) || name.includes(w);
  for (const clause of input.normalize('NFKC').split(CLAUSE_BREAK).map(drugTokens)) {
    for (let at = 0; at + name.length <= clause.length; at++) {
      if (!name.every((w, k) => clause[at + k] === w)) continue;
      let start = at;
      while (start > 0 && (IDENTITY_QUALIFIERS.has(clause[start - 1]) || FORM_WORDS.has(clause[start - 1]))) start--;
      const before = clause.slice(Math.max(0, start - 3), start);
      const negated = before.some((w) => NEGATION_CUES.has(w)) || before.join(' ').includes('don t');
      if (negated) continue;
      let end = at + name.length;
      while (end < clause.length && inDescription(clause[end])) end++;
      for (const w of clause.slice(start, end)) if (IDENTITY_QUALIFIERS.has(w) || FORM_WORDS.has(w)) allowed.add(w);
      return allowed;
    }
  }
  return allowed;
}

export function drugMatches(pred: unknown, goldDrug: string, input: string): boolean {
  if (typeof pred !== 'string') return false;
  const reply = drugTokens(pred);
  const gold = drugTokens(goldDrug);
  if (reply.length === 0 || gold.length === 0) return false;
  if (!gold.every((t) => reply.includes(t))) return false;
  const own = ownQualifiers(goldDrug, input);
  return reply.every((t) => gold.includes(t) || own.has(t));
}

/** Wrapper words that can open or close an as-needed reason without changing it. */
const REASON_OPENERS: string[][] = [['as', 'needed', 'for'], ['as', 'needed', 'to'], ['as', 'needed'], ['prn', 'for'], ['prn'], ['for'], ['if'], ['when'], ['to'], ['the'], ['a'], ['an']];
const REASON_CLOSERS: string[][] = [['as', 'needed'], ['prn']];

/** The reason with its wrapper words removed, word order kept, and word breaks ignored. */
export function reasonKey(text: string): string {
  let words = text.normalize('NFKC').toLowerCase().replace(/[&+/]/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const startsWith = (p: string[]) => p.length <= words.length && p.every((w, i) => words[i] === w);
  const endsWith = (p: string[]) => p.length <= words.length && p.every((w, i) => words[words.length - p.length + i] === w);
  for (let changed = true; changed; ) {
    changed = false;
    const opener = REASON_OPENERS.find(startsWith);
    if (opener) {
      words = words.slice(opener.length);
      changed = true;
    }
    const closer = REASON_CLOSERS.find(endsWith);
    if (closer) {
      words = words.slice(0, words.length - closer.length);
      changed = true;
    }
  }
  return words.join('');
}

export function reasonMatches(pred: unknown, gold: string | null): boolean {
  if (gold === null) return pred === null || (typeof pred === 'string' && pred.trim() === '');
  if (typeof pred !== 'string') return false;
  const reply = reasonKey(pred);
  return reply !== '' && reply === reasonKey(gold);
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

/** A finite number, or a string that is a plain decimal with a finite value. Anything else is null. */
export function strictNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*$/.test(value)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const close = (a: number, b: number) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

export function doseMatchesV3(pred: unknown, gold: SigGold['dose_per_administration']): boolean {
  const goldUnit = normalizeUnitV3(gold.unit);
  if (goldUnit === null || typeof gold.value !== 'number' || !Number.isFinite(gold.value)) {
    throw new Error(`Invalid gold dose ${JSON.stringify(gold)}: the gold unit must be one of mg, mcg, g, units or mL, with a finite value`);
  }
  if (!pred || typeof pred !== 'object' || Array.isArray(pred)) return false;
  const { value, unit } = pred as { value?: unknown; unit?: unknown };
  const amount = strictNumber(value);
  const replyUnit = normalizeUnitV3(unit);
  if (amount === null || replyUnit === null) return false;
  if (replyUnit in MASS_IN_MCG && goldUnit in MASS_IN_MCG) {
    return close(amount * MASS_IN_MCG[replyUnit], gold.value * MASS_IN_MCG[goldUnit]);
  }
  return replyUnit === goldUnit && close(amount, gold.value);
}

export type ParseHow = 'direct' | 'embedded' | 'several' | 'none';

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

/**
 * Parses a reply. Takes the whole reply when it is one object, or the one object embedded in it.
 * Several objects are ambiguous: none is chosen, and the reply counts as not parsed.
 */
export function parsePredictionV3(text: string): { value: SigPrediction | null; how: ParseHow } {
  const direct = asObject(text.trim());
  if (direct) return { value: direct as SigPrediction, how: 'direct' };
  const objects = balancedObjects(text).map(asObject).filter((v): v is Record<string, unknown> => v !== null);
  if (objects.length === 0) return { value: null, how: 'none' };
  if (objects.length > 1) return { value: null, how: 'several' };
  return { value: objects[0] as SigPrediction, how: 'embedded' };
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
    const problem = how === 'several' ? '$: several JSON objects, so none was scored' : '$: no JSON object found';
    return { id: gold.id, parsed: false, allCorrect: false, parseHow: how, schemaProblems: [problem], ...none };
  }
  const fields: Record<SigField, boolean> = {
    drug: drugMatches(pred.drug, gold.drug, input),
    dose: doseMatchesV3(pred.dose_per_administration, gold.dose_per_administration),
    frequency: normalizeLabel(pred.frequency) === normalizeLabel(gold.frequency),
    timing: normalizeLabel(pred.timing) === normalizeLabel(gold.timing),
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
