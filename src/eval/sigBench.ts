/**
 * The sig bench (bench/sig-bench): 120 synthetic medication instructions with PROPOSED labels for a
 * pharmacist to confirm. Pure functions, no I/O. The command is scripts/sig-bench.ts.
 *
 * What lives here:
 * - checks on the item file (ids, label status, label format, the clarification share)
 * - the confirmation sheet (confirm.csv) and the six-field suite file the eval harness can run
 * - the near-duplicate check against the development and template lines (Jaccard on words, 0.7)
 * - the rules baseline over the bench, scored against the proposed labels, by tier
 *
 * Every number this produces is against proposed labels until Kevin confirms them.
 */
import { rulesSig } from './sigBaselines';
import { schemaProblems, wordTokens } from './sigScoreV3';
import { scoreSixField, sixFieldGold, sixFieldRepresentable, type BenchItem, type BenchLabel } from './sigBenchScore';

export const BENCH_SIZE = 120;
/** The brief asks for about 15% of items whose right answer is "needs clarification". */
export const CLARIFY_SHARE = { min: 0.13, max: 0.17 };
export const DEDUPE_THRESHOLD = 0.7;

export function parseItems(text: string): BenchItem[] {
  return text
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as BenchItem);
}

// ─── Checks ───────────────────────────────────────────────────────────────────

/** Problems with the item file. Empty means it is well formed. */
export function itemProblems(items: BenchItem[], labelSchema: object): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const it of items) {
    const at = it.id ?? '(no id)';
    if (!/^sb-\d{3}$/.test(it.id)) out.push(`${at}: id must look like sb-001`);
    if (ids.has(it.id)) out.push(`${at}: duplicate id`);
    ids.add(it.id);
    if (it.label_status !== 'proposed' && it.label_status !== 'confirmed') out.push(`${at}: label_status must be proposed or confirmed`);
    if (it.tier !== 'clean' && it.tier !== 'hard') out.push(`${at}: tier must be clean or hard`);
    if (!Array.isArray(it.categories) || it.categories.length === 0) out.push(`${at}: no categories`);
    if (typeof it.sig !== 'string' || it.sig.trim() === '') out.push(`${at}: empty sig`);
    for (const p of schemaProblems(it.label, labelSchema)) out.push(`${at}: ${p}`);
    const l = it.label;
    if (l.needs_clarification !== (l.clarification_reason !== null)) out.push(`${at}: a reason is required exactly when the line needs clarification`);
    if (l.needs_clarification && !it.categories.includes('needs_clarification')) out.push(`${at}: needs clarification but is not in that category`);
    if (!l.needs_clarification && it.categories.includes('needs_clarification')) out.push(`${at}: in the clarification category but not flagged`);
    if (l.needs_clarification && it.tier !== 'hard') out.push(`${at}: a line that needs clarification is hard`);
    if (it.tier === 'clean' && !sixFieldRepresentable(l)) out.push(`${at}: a clean line must fit the six fields`);
    if (l.prn_indication !== null && !l.prn) out.push(`${at}: a reason without as-needed use`);
    if (l.prn_interval && l.prn_interval.min > l.prn_interval.max) out.push(`${at}: interval min above max`);
    if (l.dose_high !== null && (!l.dose_per_administration || l.dose_high <= l.dose_per_administration.value)) out.push(`${at}: dose_high must sit above a dose`);
    if (it.alt && 'frequency' in it.alt && it.alt.frequency === l.frequency) out.push(`${at}: alt.frequency equals the label`);
  }
  return out;
}

export function clarifyShare(items: BenchItem[]): number {
  return items.filter((i) => i.label.needs_clarification).length / items.length;
}

// ─── Near duplicates of the development lines ─────────────────────────────────

export function jaccard(a: string, b: string): number {
  const x = new Set(wordTokens(a));
  const y = new Set(wordTokens(b));
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  const either = x.size + y.size - both;
  return either === 0 ? 0 : both / either;
}

export interface NearDuplicate {
  id: string;
  against: string;
  similarity: number;
}

/** Every bench line whose words overlap a reference line at the threshold or above. */
export function nearDuplicates(items: BenchItem[], reference: Array<{ id: string; input: string }>, threshold = DEDUPE_THRESHOLD): NearDuplicate[] {
  const out: NearDuplicate[] = [];
  for (const it of items) {
    for (const r of reference) {
      const s = jaccard(it.sig, r.input);
      if (s >= threshold) out.push({ id: it.id, against: r.id, similarity: Math.round(s * 1000) / 1000 });
    }
  }
  return out;
}

export function maxSimilarity(items: BenchItem[], reference: Array<{ id: string; input: string }>): number {
  let max = 0;
  for (const it of items) for (const r of reference) max = Math.max(max, jaccard(it.sig, r.input));
  return Math.round(max * 1000) / 1000;
}

// ─── Confirmation sheet ───────────────────────────────────────────────────────

/** Sheet groups, in the order Kevin reads them: ambiguous lines, then tapers, then other hard lines, then clean. */
export function sheetGroup(it: BenchItem): 1 | 2 | 3 | 4 {
  if (it.label.needs_clarification) return 1;
  if (it.label.phases !== null || it.categories.includes('taper')) return 2;
  return it.tier === 'hard' ? 3 : 4;
}
const GROUP_NAME = { 1: 'needs clarification', 2: 'taper or phases', 3: 'hard', 4: 'clean' } as const;

const amount = (d: { value: number; unit: string } | null) => (d ? `${d.value} ${d.unit}` : '');
const yesNo = (b: boolean) => (b ? 'yes' : 'no');

function phasesText(l: BenchLabel): string {
  if (!l.phases) return '';
  return l.phases
    .map((p) => {
      const parts = [amount(p.dose) || 'no dose', p.frequency ?? 'no frequency'];
      if (p.days !== null) parts.push(`x ${p.days} d`);
      if (p.days_of_week) parts.push(`on ${p.days_of_week.map((d) => d.slice(0, 3)).join(' ')}`);
      if (p.days === null && !p.days_of_week) parts.push('ongoing');
      return parts.join(' ');
    })
    .join(', then ');
}

function scaleText(l: BenchLabel): string {
  if (!l.sliding_scale) return '';
  return l.sliding_scale
    .map((s) => {
      const range = s.bg_min === null ? `up to ${s.bg_max}` : s.bg_max === null ? `${s.bg_min} and above` : `${s.bg_min} to ${s.bg_max}`;
      return `${range}: ${s.units} units`;
    })
    .join(', ');
}

function intervalText(l: BenchLabel): string {
  const i = l.prn_interval;
  if (!i) return '';
  return i.min === i.max ? `every ${i.min} ${i.unit}` : `every ${i.min} to ${i.max} ${i.unit}`;
}

export const SHEET_COLUMNS = [
  'id', 'sig', 'group', 'tier', 'categories', 'label_status',
  'needs_clarification', 'clarification_reason',
  'drug', 'dose', 'dose_high', 'frequency', 'frequency_prompt_reading', 'timing', 'prn', 'prn_indication',
  'prn_interval', 'max_doses_per_day', 'max_daily_dose', 'route', 'laterality', 'duration_days', 'days_of_week',
  'phases', 'sliding_scale', 'six_field_representable', 'also_accepted', 'note', 'kevin',
] as const;

function sheetRow(it: BenchItem): Record<(typeof SHEET_COLUMNS)[number], string> {
  const l = it.label;
  const accepted = [...(it.accept?.drug ?? []).map((d) => `drug ${d}`), ...(it.accept?.prn_indication ?? []).map((r) => `reason ${r}`)];
  return {
    id: it.id,
    sig: it.sig,
    group: GROUP_NAME[sheetGroup(it)],
    tier: it.tier,
    categories: it.categories.join(' '),
    label_status: it.label_status,
    needs_clarification: yesNo(l.needs_clarification),
    clarification_reason: l.clarification_reason ?? '',
    drug: l.drug ?? '',
    dose: amount(l.dose_per_administration),
    dose_high: l.dose_high === null ? '' : String(l.dose_high),
    frequency: l.frequency ?? '',
    frequency_prompt_reading: it.alt && 'frequency' in it.alt ? it.alt.frequency ?? '' : '',
    timing: l.timing ?? '',
    prn: yesNo(l.prn),
    prn_indication: l.prn_indication ?? '',
    prn_interval: intervalText(l),
    max_doses_per_day: l.max_doses_per_day === null ? '' : String(l.max_doses_per_day),
    max_daily_dose: amount(l.max_daily_dose),
    route: l.route ?? '',
    laterality: l.laterality ?? '',
    duration_days: l.duration_days === null ? '' : String(l.duration_days),
    days_of_week: l.days_of_week ? l.days_of_week.join(' ') : '',
    phases: phasesText(l),
    sliding_scale: scaleText(l),
    six_field_representable: yesNo(sixFieldRepresentable(l)),
    also_accepted: accepted.join(', '),
    note: it.note ?? '',
    kevin: '',
  };
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The confirmation sheet: one row per item, ambiguous lines first, then tapers, with an empty kevin column. */
export function confirmCsv(items: BenchItem[]): string {
  const sorted = [...items].sort((a, b) => sheetGroup(a) - sheetGroup(b) || a.id.localeCompare(b.id));
  const lines = [SHEET_COLUMNS.join(',')];
  for (const it of sorted) {
    const row = sheetRow(it);
    lines.push(SHEET_COLUMNS.map((c) => csvCell(row[c])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

// ─── Six-field suite for the eval harness ─────────────────────────────────────

/**
 * A suite file for `npm run eval -- --suite <file>`: the lines the six fields can hold, with their
 * six-field gold under Kevin's ruling. Lines the six fields cannot hold are listed by id only.
 */
export function sixFieldSuite(items: BenchItem[]): object {
  const cases = items
    .map((it) => ({ it, gold: sixFieldGold(it) }))
    .filter((x) => x.gold !== null)
    .map(({ it, gold }) => ({ id: it.id, input: it.sig, tags: [it.tier, ...it.categories], gold }));
  return {
    status: 'sig bench, PROPOSED labels not yet confirmed by a pharmacist. Development data: written by the same family that wrote the scorer and the rules parser.',
    conventions: { bedtimeAsNeeded: 'no-schedule' },
    cases,
    not_representable: items.filter((it) => !sixFieldRepresentable(it.label)).map((it) => it.id),
  };
}

// ─── Rules baseline ───────────────────────────────────────────────────────────

export interface TierTally {
  items: number;
  representable: number;
  /** Six fields all right on representable lines, under Kevin's ruling. */
  sixFieldRight: number;
  /** The same under the frozen prompt's reading, where an as-needed rate is a schedule, with the parser's once-daily bedtime rule. */
  sixFieldRightPromptReading: number;
  notRepresentable: number;
  needsClarification: number;
  /** Lines the rules parser left words unread on, its only review signal. */
  flagged: number;
  flaggedNeedsClarification: number;
  flaggedNotRepresentable: number;
  flaggedRepresentable: number;
}

export interface RulesBenchResult {
  label_status: string;
  scorer: string;
  baseline: string;
  /** The parser's bedtime rule under each reading. */
  bedtimeAsNeeded: { ruling: 'no-schedule'; prompt: 'once-daily' };
  tiers: Record<'clean' | 'hard' | 'all', TierTally>;
  /** Per line: id, tier, whether representable, six-field verdict under each reading, and how many words went unread. */
  lines: Array<{ id: string; tier: string; representable: boolean; right: boolean | null; rightPromptReading: boolean | null; wrongFields: string[]; unread: number }>;
}

const emptyTally = (): TierTally => ({
  items: 0, representable: 0, sixFieldRight: 0, sixFieldRightPromptReading: 0, notRepresentable: 0,
  needsClarification: 0, flagged: 0, flaggedNeedsClarification: 0, flaggedNotRepresentable: 0, flaggedRepresentable: 0,
});

/** Runs the frozen rules parser on every line and scores it against the proposed labels. */
export function rulesOnBench(items: BenchItem[]): RulesBenchResult {
  const tiers = { clean: emptyTally(), hard: emptyTally(), all: emptyTally() };
  const lines: RulesBenchResult['lines'] = [];
  for (const it of items) {
    // Each reading runs the parser with its own rule for "at bedtime as needed".
    const r = rulesSig(it.sig, { bedtimeAsNeeded: 'no-schedule' });
    const ruling = scoreSixField(it, JSON.stringify(r.prediction), 'ruling');
    const prompt = scoreSixField(it, JSON.stringify(rulesSig(it.sig, { bedtimeAsNeeded: 'once-daily' }).prediction), 'prompt');
    const representable = ruling !== null;
    const flagged = r.unread.length > 0;
    for (const t of [tiers[it.tier], tiers.all]) {
      t.items++;
      if (representable) {
        t.representable++;
        if (ruling!.allCorrect) t.sixFieldRight++;
        if (prompt!.allCorrect) t.sixFieldRightPromptReading++;
        if (flagged) t.flaggedRepresentable++;
      } else {
        t.notRepresentable++;
        if (flagged) t.flaggedNotRepresentable++;
      }
      if (it.label.needs_clarification) {
        t.needsClarification++;
        if (flagged) t.flaggedNeedsClarification++;
      }
      if (flagged) t.flagged++;
    }
    lines.push({
      id: it.id,
      tier: it.tier,
      representable,
      right: ruling ? ruling.allCorrect : null,
      rightPromptReading: prompt ? prompt.allCorrect : null,
      wrongFields: ruling ? Object.entries(ruling.fields).filter(([, ok]) => !ok).map(([f]) => f) : [],
      unread: r.unread.length,
    });
  }
  return {
    label_status: 'proposed, not confirmed by a pharmacist',
    scorer: 'sig-v3 (src/eval/sigScoreV3.ts) on the six fields, through src/eval/sigBenchScore.ts',
    baseline: 'rules (src/eval/sigBaselines.ts), frozen',
    bedtimeAsNeeded: { ruling: 'no-schedule', prompt: 'once-daily' },
    tiers,
    lines,
  };
}
