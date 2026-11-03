/**
 * Recomputes the published model decision from the saved replies, under each reading of the one
 * contested label convention, with and without the latency gate. No model is called.
 *
 * The split-format gold labels "at bedtime as needed" as frequency once_daily. The extraction
 * audit protocol in this same repository takes the opposite rule (a bedtime anchor is not a
 * schedule). The pick depends on which rule is used, so both are computed here. The rule that
 * should apply is a pharmacist's decision, not this code's.
 */
import type { SigGold } from './sigScore';
import { scoreCaseV3 } from './sigScoreV3';

export type Convention = 'bedtime-prn-is-once-daily' | 'bedtime-prn-has-no-schedule';

/** Applies a convention to a gold record. Only as-needed lines anchored at bedtime change. */
export function applyConvention(gold: SigGold, convention: Convention): SigGold {
  if (convention === 'bedtime-prn-is-once-daily') return gold;
  if (gold.prn && gold.timing === 'bedtime' && gold.frequency === 'once_daily') return { ...gold, frequency: null };
  return gold;
}

export interface SavedRow { id: string; input: string; gold: SigGold; output: string; latencyMs: number | null }

export interface ModelEvidence {
  id: string;
  /** Saved replies per run on the 25 development lines. */
  runs: SavedRow[][];
  /** Disk size in GB as written in docs/ORIGINAL-EVALUATION.md. The harness did not record it then. */
  diskGb: number;
}

export interface Decision {
  convention: Convention;
  latencyGate: 'not applied' | 'applied';
  allFields: Record<string, number[]>;
  passedCorrectness: string[];
  passedStability: string[];
  passedLatency: string[] | null;
  pick: string | null;
  reason: string;
}

const allCorrect = (rows: SavedRow[], convention: Convention) =>
  rows.filter((r) => scoreCaseV3(applyConvention(r.gold, convention), r.output, r.input).allCorrect).length;

/** Parsed answers identical across runs, computed from the saved replies rather than asserted. */
export function stableAcrossRuns(runs: SavedRow[][]): boolean {
  const key = (rows: SavedRow[]) => JSON.stringify(rows.map((r) => [r.id, JSON.parse(r.output)]).sort());
  return runs.every((run) => key(run) === key(runs[0]));
}

export function nearestRankP95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(1, Math.ceil(0.95 * sorted.length)) - 1];
}

/**
 * The published rubric: every field right on every line in every run, the same parsed answers
 * across runs, p95 at or under the budget when the gate is applied, then the smaller disk size.
 */
export function decide(models: ModelEvidence[], convention: Convention, latency: { applied: false } | { applied: true; p95ByModel: Record<string, number>; budgetMs: number }): Decision {
  const allFields = Object.fromEntries(models.map((m) => [m.id, m.runs.map((run) => allCorrect(run, convention))]));
  const n = models[0]?.runs[0]?.length ?? 0;
  const correct = models.filter((m) => allFields[m.id].every((count) => count === n));
  const stable = correct.filter((m) => stableAcrossRuns(m.runs));
  let remaining = stable;
  let passedLatency: string[] | null = null;
  if (latency.applied) {
    remaining = stable.filter((m) => latency.p95ByModel[m.id] !== undefined && latency.p95ByModel[m.id] <= latency.budgetMs);
    passedLatency = remaining.map((m) => m.id);
  }
  const ordered = [...remaining].sort((a, b) => a.diskGb - b.diskGb);
  const pick = ordered[0]?.id ?? null;
  let reason: string;
  if (correct.length === 0) reason = 'No model had every field right on every line in every run.';
  else if (latency.applied && remaining.length === 0) reason = 'No model that passed correctness met the latency budget.';
  else if (remaining.length === 1) reason = `Only ${pick} passed every applied gate.`;
  else reason = `${remaining.map((m) => m.id).join(' and ')} tie on the applied gates. ${pick} wins on disk size (${ordered[0].diskGb} GB against ${ordered[1].diskGb} GB).`;
  return {
    convention,
    latencyGate: latency.applied ? 'applied' : 'not applied',
    allFields,
    passedCorrectness: correct.map((m) => m.id),
    passedStability: stable.map((m) => m.id),
    passedLatency,
    pick,
    reason,
  };
}
