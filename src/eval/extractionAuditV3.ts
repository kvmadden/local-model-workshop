/**
 * Extraction audit evaluator v3.
 *
 * v1 and v2 (src/eval/extractionAudit.ts and the archived v1 source) stay frozen because they
 * produced committed reports. v3 is for the next complete run, and for re-reading saved replies.
 *
 * What v3 changes, and why:
 * - A fact and its evidence are scored separately. v2 counted a right value with a wrong character
 *   offset as both an invented fact and a missing one. In the saved partial run, 93 of 182
 *   predicted facts had the right value and the wrong offsets. Language models are poor at
 *   counting characters, so v2 mostly measured counting.
 * - Evidence can be quoted text. The harness finds the quote in the input, so nobody has to count.
 *   Character spans are still accepted. Evidence matches when it covers the same text as the gold
 *   evidence, at any occurrence.
 * - Comparisons are structural. Span key order, extra keys, span order and the order of
 *   multiplication operands no longer change the score.
 * - Repeating a correct fact costs one duplicate, instead of deleting the fact. A reply with a
 *   duplicate is not exact.
 * - Abstention is not a fact. Saying "no active instruction" on a line with no gold facts is
 *   correct, and it is never counted as an invented fact. A failed request, an empty reply or an
 *   unreadable entity is never a correct abstention.
 * - Engine errors are labeled as errors and never count as successes, a missing dose is not called
 *   a wrong dose, and malformed entities and derivations are rejected one by one instead of
 *   crashing the report.
 * - Gold derivations are checked: the operands must multiply to the stated value.
 */
import { normalize, type AuditCase, type Entity, type Span } from './extractionAudit';

export const AUDIT_EVALUATOR_V3 = 'audit-v3';
export const FACT_TASKS = ['drug', 'dose', 'schedule', 'timing', 'prn', 'indication'] as const;

export interface PredictedEntityV3 {
  task: string;
  value: string;
  /** Exact text from the input, one string per piece of evidence. */
  evidence?: string[];
  /** Zero-based character spans with exclusive ends. Accepted for v2-style replies. */
  spans?: Span[];
  derivation?: Entity['derivation'];
}

const isSpan = (s: unknown): s is Span =>
  !!s && typeof s === 'object' && Number.isInteger((s as Span).start) && Number.isInteger((s as Span).end) && (s as Span).start >= 0 && (s as Span).end > (s as Span).start;

/** Finds `quote` in `input`, exact first, then ignoring case. Returns every occurrence. */
export function locate(input: string, quote: string): Span[] {
  if (!quote) return [];
  const found: Span[] = [];
  const search = (hay: string, needle: string) => {
    let from = 0;
    while (true) {
      const at = hay.indexOf(needle, from);
      if (at === -1) break;
      found.push({ start: at, end: at + needle.length });
      from = at + 1;
    }
  };
  search(input, quote);
  if (found.length === 0) search(input.toLowerCase(), quote.toLowerCase());
  return found;
}

/** The evidence texts an entity points at, lowercased and whitespace-collapsed, sorted. Null if unusable. */
export function evidenceTexts(input: string, e: PredictedEntityV3): string[] | null {
  if (Array.isArray(e.evidence) && e.evidence.length > 0) {
    if (!e.evidence.every((q) => typeof q === 'string' && locate(input, q).length > 0)) return null;
    return e.evidence.map((q) => normalize(q)).sort();
  }
  if (Array.isArray(e.spans) && e.spans.length > 0) {
    if (!e.spans.every((s) => isSpan(s) && s.end <= input.length)) return null;
    return e.spans.map((s) => normalize(input.slice(s.start, s.end))).sort();
  }
  return null;
}

type Derivation = NonNullable<Entity['derivation']>;

/** A derivation with a named operation, a unit and finite numeric operands. Anything else is unusable. */
export const isDerivation = (d: unknown): d is Derivation =>
  !!d && typeof d === 'object' && typeof (d as Derivation).operation === 'string' && typeof (d as Derivation).unit === 'string' &&
  Array.isArray((d as Derivation).operands) && (d as Derivation).operands.length > 0 && (d as Derivation).operands.every((x) => typeof x === 'number' && Number.isFinite(x));

/** Same operation, unit and operands in any order. A malformed predicted derivation never matches. */
const sameDerivation = (a: unknown, b: Entity['derivation']) => {
  if ((a === undefined || a === null) && !b) return true;
  if (!isDerivation(a) || !b) return false;
  const sorted = (xs: number[]) => [...xs].sort((x, y) => x - y);
  return a.operation === b.operation && normalize(a.unit) === normalize(b.unit) && JSON.stringify(sorted(a.operands)) === JSON.stringify(sorted(b.operands));
};

/** Problems with one gold entity: bad spans, or a derivation that does not compute. */
export function goldProblems(input: string, e: Entity): string[] {
  const problems: string[] = [];
  if (!Array.isArray(e.spans) || e.spans.length === 0 || !e.spans.every((s) => isSpan(s) && s.end <= input.length)) problems.push('invalid spans');
  if (e.derivation) {
    const product = e.derivation.operands.reduce((a, b) => a * b, 1);
    const stated = Number.parseFloat(e.value);
    const unit = e.value.replace(/^[\d.,\s]+/, '').trim();
    if (!Number.isFinite(stated) || Math.abs(product - stated) > 1e-9 * Math.max(1, Math.abs(stated))) problems.push(`derivation gives ${product}, value says ${e.value}`);
    if (normalize(unit) !== normalize(e.derivation.unit)) problems.push(`derivation unit ${e.derivation.unit} does not match value ${e.value}`);
  }
  return problems;
}

export interface DocumentScoreV3 {
  /** Gold facts whose task and value were predicted. */
  factsFound: Entity[];
  /** Of those, the ones whose evidence covers the same text and whose derivation matches. */
  supported: Entity[];
  /** Gold facts with no prediction of the same task and value. */
  missing: Entity[];
  /** Predicted facts whose task and value are not in the gold. */
  extra: PredictedEntityV3[];
  /** Second and later copies of a predicted fact. */
  duplicates: PredictedEntityV3[];
  /** Predictions that could not be read (unknown task, empty value, unusable evidence). */
  malformed: unknown[];
  abstained: boolean;
  /** No facts in gold, and a readable reply that predicts none (an empty list or an abstention). */
  correctAbstention: boolean;
  exactFacts: boolean;
  exactEvidence: boolean;
}

const identity = (task: string, value: string) => `${task}:${normalize(value)}`;

export function scoreDocumentV3(input: string, gold: Entity[], prediction: unknown[]): DocumentScoreV3 {
  for (const g of gold) {
    const problems = goldProblems(input, g);
    if (problems.length) throw new Error(`Invalid gold ${g.task}:${g.value}: ${problems.join(', ')}`);
  }
  const goldById = new Map<string, Entity>();
  for (const g of gold) {
    const key = identity(g.task, g.value);
    if (goldById.has(key)) throw new Error(`Duplicate gold identity ${key}`);
    goldById.set(key, g);
  }

  const malformed: unknown[] = [];
  const duplicates: PredictedEntityV3[] = [];
  const extra: PredictedEntityV3[] = [];
  const firstByKey = new Map<string, PredictedEntityV3>();
  let abstained = false;
  for (const raw of Array.isArray(prediction) ? prediction : []) {
    const e = raw as PredictedEntityV3;
    if (!e || typeof e !== 'object' || typeof e.task !== 'string') {
      malformed.push(raw);
      continue;
    }
    if (e.task === 'abstention') {
      abstained = true;
      continue;
    }
    if (!(FACT_TASKS as readonly string[]).includes(e.task) || typeof e.value !== 'string' || !e.value.trim()) {
      malformed.push(raw);
      continue;
    }
    const key = identity(e.task, e.value);
    if (firstByKey.has(key)) {
      duplicates.push(e);
      continue;
    }
    firstByKey.set(key, e);
  }

  const factsFound: Entity[] = [];
  const supported: Entity[] = [];
  for (const [key, e] of firstByKey) {
    const target = goldById.get(key);
    if (!target) {
      extra.push(e);
      continue;
    }
    factsFound.push(target);
    const want = evidenceTexts(input, target as PredictedEntityV3);
    const got = evidenceTexts(input, e);
    if (want && got && JSON.stringify(want) === JSON.stringify(got) && sameDerivation(e.derivation, target.derivation)) supported.push(target);
  }
  const foundKeys = new Set(factsFound.map((g) => identity(g.task, g.value)));
  const missing = gold.filter((g) => !foundKeys.has(identity(g.task, g.value)));
  const clean = malformed.length === 0 && duplicates.length === 0;
  const correctAbstention = gold.length === 0 && firstByKey.size === 0 && clean;
  return {
    factsFound,
    supported,
    missing,
    extra,
    duplicates,
    malformed,
    abstained,
    correctAbstention,
    exactFacts: missing.length === 0 && extra.length === 0 && clean,
    exactEvidence: missing.length === 0 && extra.length === 0 && clean && supported.length === factsFound.length,
  };
}

export const FAILURE_ORDER_V3 = ['engine error', 'wrong dose', 'invented medication', 'missing dose', 'lost PRN or schedule', 'missing fact', 'unsupported extra', 'malformed output', 'evidence only'] as const;
export type FailureV3 = (typeof FAILURE_ORDER_V3)[number];

/** The first failure that applies, in order of clinical weight. Engine errors come first. */
export function failureTypeV3(score: DocumentScoreV3, error?: string | null): FailureV3 | null {
  if (error) return 'engine error';
  if (score.extra.some((e) => e.task === 'dose')) return 'wrong dose';
  if (score.extra.some((e) => e.task === 'drug')) return 'invented medication';
  if (score.missing.some((e) => e.task === 'dose')) return 'missing dose';
  if (score.missing.some((e) => e.task === 'prn' || e.task === 'schedule')) return 'lost PRN or schedule';
  if (score.missing.length) return 'missing fact';
  if (score.extra.length || score.duplicates.length) return 'unsupported extra';
  if (score.malformed.length) return 'malformed output';
  if (score.supported.length < score.factsFound.length) return 'evidence only';
  return null;
}

export interface RowV3 { id: string; output: string | null; error: string | null; latencyMs: number | null }

/**
 * Reads a reply into entities. Unreadable output becomes a malformed entry, never a crash. No
 * output at all (an empty reply, or a failed request) is malformed too, so it can never pass as
 * an abstention.
 */
export function parseEntitiesV3(output: string | null): unknown[] {
  if (output === null || !output.trim()) return [{ unreadable: true, reason: 'no output' }];
  try {
    const value = JSON.parse(output);
    if (value && Array.isArray(value.entities)) return value.no_active_instruction === true ? [...value.entities, { task: 'abstention', value: 'no active instruction' }] : value.entities;
    if (value && value.no_active_instruction === true) return [{ task: 'abstention', value: 'no active instruction' }];
    return [{ unreadable: true }];
  } catch {
    return [{ unreadable: true }];
  }
}

export interface ReportTotals {
  documents: number;
  /** Requests that failed. Their documents score as unreadable, so they never count as exact. */
  engineErrors: number;
  goldFacts: number;
  predictedFacts: number;
  factsFound: number;
  supported: number;
  extra: number;
  duplicates: number;
  malformed: number;
  exactFacts: number;
  exactEvidence: number;
  correctAbstentions: number;
  /** Facts found / gold facts, and supported / gold facts. Null when there are no gold facts. */
  factRecall: number | null;
  supportedRecall: number | null;
  /** Facts found / predicted facts. Null when nothing was predicted. */
  factPrecision: number | null;
}

/** Scores saved replies against the cases they answer. Cases with no reply are reported as not measured. */
export function reportV3(cases: AuditCase[], rows: RowV3[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const documents = cases.map((c) => {
    const row = byId.get(c.id);
    if (!row) return { id: c.id, split: c.split, measured: false as const };
    // A failed request is scored as no output, whatever text came with it.
    const score = scoreDocumentV3(c.input, c.gold, row.error ? parseEntitiesV3(null) : parseEntitiesV3(row.output));
    return { id: c.id, split: c.split, measured: true as const, error: row.error, latencyMs: row.latencyMs, failure: failureTypeV3(score, row.error), ...score };
  });
  const totals = (split?: string): ReportTotals => {
    const docs = documents.filter((d) => d.measured && (!split || d.split === split)) as Extract<(typeof documents)[number], { measured: true }>[];
    const sum = (f: (d: (typeof docs)[number]) => number) => docs.reduce((n, d) => n + f(d), 0);
    const goldFacts = sum((d) => d.factsFound.length + d.missing.length);
    const predictedFacts = sum((d) => d.factsFound.length + d.extra.length + d.duplicates.length);
    const found = sum((d) => d.factsFound.length);
    const supported = sum((d) => d.supported.length);
    return {
      documents: docs.length,
      engineErrors: docs.filter((d) => d.error).length,
      goldFacts,
      predictedFacts,
      factsFound: found,
      supported,
      extra: sum((d) => d.extra.length),
      duplicates: sum((d) => d.duplicates.length),
      malformed: sum((d) => d.malformed.length),
      exactFacts: docs.filter((d) => d.exactFacts).length,
      exactEvidence: docs.filter((d) => d.exactEvidence).length,
      correctAbstentions: docs.filter((d) => d.correctAbstention).length,
      factRecall: goldFacts ? found / goldFacts : null,
      supportedRecall: goldFacts ? supported / goldFacts : null,
      factPrecision: predictedFacts ? found / predictedFacts : null,
    };
  };
  return {
    evaluatorVersion: AUDIT_EVALUATOR_V3,
    measured: documents.filter((d) => d.measured).length,
    expected: cases.length,
    all: totals(),
    bySplit: Object.fromEntries(['dev', 'final', 'challenge'].map((s) => [s, totals(s)])),
    documents,
  };
}
