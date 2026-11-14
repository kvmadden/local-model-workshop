/**
 * Rx Intake Check: combine the two readers' decisions and score a set. Pure functions, no I/O.
 *
 * Buckets of gold lines:
 * - required: the label requires a call (law or standard tier, facts verified on the held-out set)
 * - judgment: judgment-only labels, scored apart
 * - clean: no call needed
 * - hold: sig bench lines flagged only as reviewer_hold (a hold on the label, not on the prescription)
 * - unverified: held-out lines whose cited fact did not verify
 */
import { questionFor, type Decision, type Finding, type RxInput, type Tier } from './rules';

export interface GoldLine {
  needed: boolean;
  reasons: string[];
  tier: string | null;
  bucket: 'required' | 'judgment' | 'clean' | 'hold' | 'unverified';
}

const RANK: Record<Tier, number> = { law: 3, standard: 2, judgment: 1 };
const STRUCTURAL = new Set([
  'missing_dose', 'missing_frequency', 'missing_laterality', 'missing_taper_steps', 'missing_titration_plan', 'missing_sliding_scale',
  'as_directed_without_instructions', 'conflicting_frequency', 'conflicting_duration', 'alternatives_without_rule',
]);

function rebuild(input: RxInput, findings: Finding[], base: Decision): Decision {
  const tier = findings.reduce<Tier | null>((t, f) => (t === null || RANK[f.tier] > RANK[t] ? f.tier : t), null);
  const required = findings.some((f) => f.tier === 'law' || f.tier === 'standard');
  return { ...base, findings, tier, required_call: required, advisory: !required && findings.length > 0, question: questionFor(input, findings) };
}

/**
 * primary: the first reader decides. union_structural: the second reader can add a structural
 * finding (a missing element, a conflict, an open choice) the first reader's reading missed.
 * A reader whose reply did not parse is skipped. Null when no reader parsed.
 */
export function combineDecisions(input: RxInput, parts: Record<string, Decision | null>, mode: 'primary' | 'union_structural', primary: string): Decision | null {
  const first = parts[primary] ?? Object.values(parts).find((d) => d) ?? null;
  if (!first || mode === 'primary') return first;
  const findings = [...first.findings];
  for (const [name, d] of Object.entries(parts)) {
    if (name === primary || !d) continue;
    for (const f of d.findings) if (STRUCTURAL.has(f.reason) && !findings.some((x) => x.reason === f.reason)) findings.push({ ...f, fact: `${f.fact} (second reader)` });
  }
  return rebuild(input, findings, first);
}

export interface SetMetrics {
  required: { n: number; caught: number; dangerous: number; unread: number; tierAgrees: number; reasonOverlap: number };
  judgment: { n: number; raised: number; asRequired: number };
  clean: { n: number; falseAlarms: number; advisories: number; unread: number };
  hold: { n: number; required: number; advisory: number };
  unverified: { n: number; required: number };
}

export function scoreSet(golds: GoldLine[], decisions: Array<Decision | null>, ids: string[]) {
  const m: SetMetrics = {
    required: { n: 0, caught: 0, dangerous: 0, unread: 0, tierAgrees: 0, reasonOverlap: 0 },
    judgment: { n: 0, raised: 0, asRequired: 0 },
    clean: { n: 0, falseAlarms: 0, advisories: 0, unread: 0 },
    hold: { n: 0, required: 0, advisory: 0 },
    unverified: { n: 0, required: 0 },
  };
  const errors: Array<{ id: string; kind: string; gold: string; system: string }> = [];
  const show = (d: Decision | null) => (d ? `${d.required_call ? 'CALL' : d.advisory ? 'advisory' : 'no call'} ${d.tier ?? ''} [${d.findings.map((f) => f.reason).join(', ')}]` : 'unread');
  golds.forEach((g, i) => {
    const d = decisions[i];
    const goldText = `${g.needed ? 'flag' : 'no flag'} ${g.tier ?? ''} [${g.reasons.join(', ')}]`;
    if (g.bucket === 'required') {
      m.required.n++;
      if (!d) m.required.unread++;
      if (d?.required_call) {
        m.required.caught++;
        if (d.tier === g.tier) m.required.tierAgrees++;
        else errors.push({ id: ids[i], kind: 'TIER', gold: goldText, system: show(d) });
        if (d.findings.some((f) => g.reasons.includes(f.reason))) m.required.reasonOverlap++;
      } else {
        m.required.dangerous++;
        errors.push({ id: ids[i], kind: 'MISS', gold: goldText, system: show(d) });
      }
    } else if (g.bucket === 'judgment') {
      m.judgment.n++;
      if (d && d.findings.length) m.judgment.raised++;
      else errors.push({ id: ids[i], kind: 'JUDGMENT_MISS', gold: goldText, system: show(d) });
      if (d?.required_call) m.judgment.asRequired++;
    } else if (g.bucket === 'clean') {
      m.clean.n++;
      if (!d) m.clean.unread++;
      if (d?.required_call) {
        m.clean.falseAlarms++;
        errors.push({ id: ids[i], kind: 'FALSE_ALARM', gold: goldText, system: show(d) });
      } else if (d?.advisory) {
        m.clean.advisories++;
        errors.push({ id: ids[i], kind: 'ADVISORY', gold: goldText, system: show(d) });
      }
    } else if (g.bucket === 'hold') {
      m.hold.n++;
      if (d?.required_call) m.hold.required++;
      else if (d?.advisory) m.hold.advisory++;
    } else {
      m.unverified.n++;
      if (d?.required_call) m.unverified.required++;
    }
  });
  return { metrics: m, errors };
}
