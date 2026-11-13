/**
 * Sig bench v2 (bench/sig-bench/items-v2.jsonl): the item checks, the quantity arithmetic check,
 * the confirmation sheet (confirm-v2.json) and the rules baseline scored on both tiers. Pure
 * functions, no I/O. The command is scripts/sig-bench-v2.ts.
 *
 * Label status:
 * - confirmed: Kevin marked the v1 label correct, and v2 maps it with nothing he did not see.
 * - kevin-notes: Kevin marked the line "Should be flagged". The flag is set, and the likely
 *   reading and safety notes come from his note where he wrote one.
 * - proposed: not reviewed yet.
 * An item whose v2 label adds something his review did not decide lists it in open_questions and
 * goes on the confirmation sheet.
 */
import { rulesV2 } from './sigBaselinesV2';
import {
  READING_FIELDS,
  addScore,
  emptySummary,
  quantityUnit,
  renderLine,
  scoreV2Reply,
  type LabelStatus,
  type Range,
  type V2Item,
  type V2Reading,
  type V2Summary,
} from './sigBenchV2Score';

export const V2_SIZE = 120;

export function parseItemsV2(text: string): V2Item[] {
  return text
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as V2Item);
}

// ─── A small JSON Schema reader: type, enum, properties, required, additionalProperties, items, $ref ───

type Schema = {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  $ref?: string;
  $defs?: Record<string, Schema>;
};

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** Problems with a value against a schema. `root` resolves "#/$defs/name". Empty means it conforms. */
export function schemaProblemsV2(value: unknown, schema: Schema, root: Schema, path = '$'): string[] {
  const out: string[] = [];
  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    if (!allowed.includes(actual)) return [`${path}: expected ${allowed.join(' or ')}, got ${actual}`];
    if (value === null) return out;
  }
  if (schema.$ref) {
    const name = schema.$ref.replace(/^#\/\$defs\//, '');
    const target = root.$defs?.[name];
    if (!target) return [`${path}: unknown reference ${schema.$ref}`];
    out.push(...schemaProblemsV2(value, target, root, path));
  }
  if (schema.enum && !schema.enum.some((e) => e === value)) out.push(`${path}: ${JSON.stringify(value)} is not an allowed value`);
  if (schema.properties && value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in o)) out.push(`${path}.${k}: missing`);
    for (const [k, sub] of Object.entries(schema.properties)) if (k in o) out.push(...schemaProblemsV2(o[k], sub, root, `${path}.${k}`));
    if (schema.additionalProperties === false) for (const k of Object.keys(o)) if (!(k in schema.properties)) out.push(`${path}.${k}: not in the schema`);
  }
  if (schema.items && Array.isArray(value)) value.forEach((v, i) => out.push(...schemaProblemsV2(v, schema.items as Schema, root, `${path}[${i}]`)));
  return out;
}

// ─── Quantity and days supply ─────────────────────────────────────────────────

const PER_DAY: Record<string, number> = {
  once_daily: 1, twice_daily: 2, three_times_daily: 3, four_times_daily: 4,
  every_4_hours: 6, every_6_hours: 4, every_8_hours: 3, every_12_hours: 2,
  once_weekly: 1 / 7, every_other_day: 1 / 2, every_72_hours: 1 / 3, twice_weekly: 2 / 7, once_monthly: 1 / 30,
};
const MASS: Record<string, number> = { mcg: 1, mg: 1_000, g: 1_000_000 };
const COUNTED = new Set(['tab', 'cap', 'patch', 'supp']);

export interface QuantityCheck {
  /** exact: a counted form on a fixed schedule, quantity = need rounded up. covers: a liquid, quantity at least the need. within_max: as-needed use, quantity at most the most allowed. skipped: cannot be computed. */
  kind: 'exact' | 'covers' | 'within_max' | 'skipped';
  ok: boolean;
  need: number | null;
  why: string;
}

/** One dose in the dispensed unit, from the quantity per dose or from the dose and concentration. */
function perDoseIn(unit: string, q: Range | null, dose: Range | null, r: V2Reading): number | null {
  if (q && quantityUnit(q.unit) === unit) return q.max;
  const c = r.concentration;
  if (unit === 'mL' && c?.amount && c.per?.unit === 'mL') {
    const perMl = c.amount.value / c.per.value;
    if (q && quantityUnit(q.unit) === 'unit' && c.amount.unit === 'units') return q.max / perMl;
    if (dose && dose.unit in MASS && c.amount.unit in MASS) return (dose.max * MASS[dose.unit]) / (perMl * MASS[c.amount.unit]);
  }
  if (unit === 'g' && dose?.unit === 'g') return dose.max;
  return null;
}

const skip = (why: string): QuantityCheck => ({ kind: 'skipped', ok: true, need: null, why });

/** Do the quantity and days supply agree with the item's likely reading? */
export function quantityCheck(item: V2Item): QuantityCheck {
  const r = item.label.likely_reading;
  if (!r) return skip('no likely reading');
  const unit = item.input.quantity.unit;
  const qty = item.input.quantity.value;
  const days = item.input.days_supply;
  if (unit === 'each') return skip('dispensed as whole packages');
  const finish = (need: number): QuantityCheck => {
    const n = Math.round(need * 1e6) / 1e6;
    if (COUNTED.has(unit)) return { kind: 'exact', ok: Math.ceil(n - 1e-9) === qty, need: n, why: `${n} ${unit} needed` };
    return { kind: 'covers', ok: qty >= n - 1e-9, need: n, why: `${n} ${unit} needed` };
  };
  if (r.phases) {
    let total = 0;
    let used = 0;
    for (const p of r.phases) {
      const per = perDoseIn(unit, p.quantity, p.dose, r);
      const f = p.frequency ? PER_DAY[p.frequency] : undefined;
      if (per === null || f === undefined) return skip('a phase has no countable dose');
      const d = p.days ?? days - used;
      used += d;
      total += per * f * d;
    }
    return finish(total);
  }
  if (r.weekly_schedule) {
    let week = 0;
    for (const e of r.weekly_schedule) {
      const per = perDoseIn(unit, e.quantity, e.dose, r);
      if (per === null) return skip('a weekday has no countable dose');
      week += per * e.days.length;
    }
    return finish((week * days) / 7);
  }
  const per = perDoseIn(unit, r.quantity, r.dose, r);
  if (per === null) return skip('no countable dose per administration');
  const span = Math.min(days, r.duration_days ?? days);
  const f = r.frequency ? PER_DAY[r.frequency] : r.frequency_range ? r.frequency_range.max : undefined;
  if (f !== undefined && !r.prn) return finish(per * f * span);
  if (r.prn) {
    const caps: number[] = [];
    if (r.limits.max_doses_per_day !== null) caps.push(r.limits.max_doses_per_day);
    if (r.prn_interval) caps.push((24 * 60) / (r.prn_interval.min * (r.prn_interval.unit === 'h' ? 60 : 1)));
    const md = r.limits.max_daily_dose;
    if (md && r.dose && md.unit in MASS && r.dose.unit in MASS) caps.push((md.value * MASS[md.unit]) / (r.dose.max * MASS[r.dose.unit]));
    else if (md && r.dose && md.unit === r.dose.unit) caps.push(md.value / r.dose.max);
    if (!caps.length) return skip('as needed with no limit');
    const most = Math.floor(Math.min(...caps) + 1e-9) * per * span;
    return { kind: 'within_max', ok: qty <= most + 1e-9, need: most, why: `at most ${most} ${unit} can be used` };
  }
  if (r.frequency === null) return finish(per * (1 + (r.limits.max_repeats ?? 0)));
  return skip('no schedule');
}

// ─── Item checks ──────────────────────────────────────────────────────────────

const STATUS_OF: Record<string, LabelStatus> = { ok: 'confirmed', hold: 'kevin-notes' };

/** Problems with the v2 items. `v1` is the v1 item list, `review` Kevin's saved review. Empty means well formed. */
export function itemProblemsV2(
  items: V2Item[],
  schema: Schema,
  v1: Array<{ id: string; sig: string; tier: string }>,
  review: Record<string, { v: string; note?: string }>,
): string[] {
  const out: string[] = [];
  const itemSchema = schema.$defs?.item as Schema;
  const v1ById = new Map(v1.map((i) => [i.id, i]));
  const seen = new Set<string>();
  for (const it of items) {
    const at = it.id ?? '(no id)';
    for (const p of schemaProblemsV2(it, itemSchema, schema)) out.push(`${at}: ${p}`);
    if (seen.has(it.id)) out.push(`${at}: duplicate id`);
    seen.add(it.id);
    const old = v1ById.get(it.id);
    if (!old) out.push(`${at}: not a v1 id`);
    else {
      if (old.sig !== it.source_line) out.push(`${at}: source_line differs from the v1 line`);
      if (old.tier !== it.tier) out.push(`${at}: tier differs from v1`);
    }
    const k = review[it.id];
    const status = k ? STATUS_OF[k.v] : 'proposed';
    if (it.label_status !== status) out.push(`${at}: label_status ${it.label_status}, but the review says ${status}`);
    if ((it.review.verdict ?? null) !== (k?.v ?? null) || (it.review.note ?? null) !== (k?.note ?? null)) out.push(`${at}: review does not match the saved review`);
    const l = it.label;
    if (k?.v === 'hold' && !l.flag.needed) out.push(`${at}: Kevin marked it Should be flagged, so flag.needed must be true`);
    if (k?.v === 'ok' && l.flag.needed) out.push(`${at}: Kevin marked the unflagged label correct, so flag.needed must be false`);
    if (l.flag.needed !== l.flag.reasons.length > 0) out.push(`${at}: reasons are required exactly when flagged`);
    if (it.quantity_role !== 'consistent' && (!l.flag.needed || !it.quantity_math)) out.push(`${at}: an unclear-sig quantity role needs a flag and the arithmetic`);
    if (it.label_status === 'proposed' && it.open_questions.length) out.push(`${at}: a proposed item uses proposal_note, not open_questions`);
    if (it.label_status !== 'proposed' && it.proposal_note !== null) out.push(`${at}: a reviewed item uses open_questions, not proposal_note`);
    const r = l.likely_reading;
    if (r) {
      for (const g of [r.dose, r.quantity, ...(r.phases ?? []).flatMap((p) => [p.dose, p.quantity]), ...(r.weekly_schedule ?? []).flatMap((e) => [e.dose, e.quantity])]) {
        if (g && g.min > g.max) out.push(`${at}: a range has min above max`);
      }
      if (r.weekly_schedule && (r.dose || r.quantity || r.phases)) out.push(`${at}: with a weekly schedule, the top-level dose, quantity and phases are null`);
      if (r.frequency_range && r.frequency) out.push(`${at}: frequency is null when frequency_range is set`);
      if (r.prn_indication !== null && !r.prn) out.push(`${at}: a reason without as-needed use`);
      if (r.basis.length === 0) out.push(`${at}: a likely reading needs a basis`);
      if (r.basis.some((b) => b.source === 'kevin_note') && !it.review.note) out.push(`${at}: a basis cites Kevin's note, but he wrote none on this line`);
      if (it.quantity_role !== 'leaves_ambiguous') {
        const c = quantityCheck(it);
        if (!c.ok) out.push(`${at}: quantity ${it.input.quantity.value} ${it.input.quantity.unit} for ${it.input.days_supply} days does not fit the reading (${c.kind}, ${c.why})`);
      }
    }
  }
  for (const id of v1ById.keys()) if (!seen.has(id)) out.push(`${id}: missing from v2`);
  return out;
}

// ─── Text for the sheet ───────────────────────────────────────────────────────

const span = (g: Range | null) => (g ? (g.min === g.max ? `${g.min} ${g.unit}` : `${g.min} to ${g.max} ${g.unit}`) : null);
const words = (s: string | null) => (s ? s.replace(/_/g, ' ') : null);

/** A likely reading in one plain line, for the confirmation sheet. */
export function readingText(r: V2Reading | null): string {
  if (!r) return 'none: do not act on this line until the prescriber answers';
  const parts: string[] = [];
  parts.push(r.drug ?? 'no drug');
  const form = [words(r.dosage_form), r.package ? `${words(r.package)} package` : null].filter(Boolean).join(', ');
  if (form) parts.push(`(${form})`);
  const c = r.concentration;
  if (c) parts.push(c.percent !== null ? `${c.percent}%` : `${c.amount?.value} ${c.amount?.unit}/${c.per?.value === 1 ? '' : `${c.per?.value} `}${c.per?.unit}`);
  const sameAsDose = r.quantity?.unit === 'unit' && r.dose?.unit === 'units';
  const amount = [span(r.dose), r.quantity && !sameAsDose ? `${span(r.quantity)}` : null].filter(Boolean).join(' = ');
  if (amount) parts.push(amount);
  if (r.application_amount) parts.push(r.application_amount.length ? `${words(r.application_amount.qualifier)} of ${r.application_amount.length.value} ${r.application_amount.length.unit}` : words(r.application_amount.qualifier) as string);
  if (r.route) parts.push(r.route);
  if (r.laterality) parts.push(r.laterality === 'both' ? 'each side' : r.laterality === 'affected' ? 'affected side(s)' : `${r.laterality} side`);
  if (r.weekly_schedule) parts.push(`weekly pattern: ${r.weekly_schedule.map((e) => `${span(e.dose)} on ${e.days.map((d) => d.slice(0, 3)).join(' ')}`).join(', ')}`);
  if (r.phases) parts.push(`steps: ${r.phases.map((p) => `${span(p.dose) ?? 'no dose'}${p.quantity ? ` (${span(p.quantity)})` : ''} ${words(p.frequency) ?? ''}${p.timing ? ` at ${words(p.timing)}` : ''}${p.days !== null ? ` x ${p.days} d` : ' ongoing'}`).join(', then ')}`);
  if (r.frequency) parts.push(words(r.frequency) as string);
  if (r.frequency_range) parts.push(`${r.frequency_range.min} to ${r.frequency_range.max} times a day`);
  if (r.timing) parts.push(`timing ${words(r.timing)}`);
  if (r.days_of_week) parts.push(`on ${r.days_of_week.join(' ')}`);
  if (r.prn) parts.push(`as needed${r.prn_indication ? ` for ${r.prn_indication}` : ''}`);
  if (r.prn_interval) parts.push(r.prn_interval.min === r.prn_interval.max ? `every ${r.prn_interval.min} ${r.prn_interval.unit}` : `every ${r.prn_interval.min} to ${r.prn_interval.max} ${r.prn_interval.unit}`);
  const lim = r.limits;
  if (lim.max_daily_dose) parts.push(`max ${lim.max_daily_dose.value} ${lim.max_daily_dose.unit} a day`);
  if (lim.max_doses_per_day !== null) parts.push(`at most ${lim.max_doses_per_day} doses a day`);
  if (lim.max_doses_in_window) parts.push(`at most ${lim.max_doses_in_window.count} doses in ${lim.max_doses_in_window.window.value} ${lim.max_doses_in_window.window.unit}`);
  if (lim.max_repeats !== null) parts.push(`at most ${lim.max_repeats} repeat`);
  if (r.duration_days !== null) parts.push(`for ${r.duration_days} days`);
  if (r.sliding_scale) parts.push(`scale: ${r.sliding_scale.map((s) => `${s.bg_min ?? 'up to'}${s.bg_max === null ? ' and up' : s.bg_min === null ? ` ${s.bg_max}` : ` to ${s.bg_max}`} = ${s.units} units`).join(', ')}`);
  return parts.join(', ');
}

/** The e-prescription as a model sees it. */
export function renderPrescription(input: V2Item['input']): string {
  const blank = (v: string | null) => v ?? '(blank)';
  return [
    `Drug: ${blank(input.drug_description)}`,
    `Strength: ${blank(input.strength)}`,
    `Dosage form: ${blank(input.dosage_form)}`,
    `Sig: ${input.sig}`,
    `Quantity: ${input.quantity.value} ${input.quantity.unit}`,
    `Days supply: ${input.days_supply}`,
  ].join('\n');
}

/** What v2 adds on an unreviewed item, when its proposal note does not say. */
function autoChange(it: V2Item): string {
  const r = it.label.likely_reading;
  const c = quantityCheck(it);
  const qty = `Quantity ${it.input.quantity.value} ${it.input.quantity.unit} for ${it.input.days_supply} days${c.kind === 'skipped' ? '' : ` (${c.why})`}.`;
  if (!r) return qty;
  const added: string[] = [];
  if (r.dose && r.dose.min !== r.dose.max) added.push(`dose range ${span(r.dose)}`);
  if (r.quantity) added.push(`${span(r.quantity)} per dose`);
  if (r.concentration) added.push('concentration');
  if (r.phases?.some((p) => p.timing)) added.push('timing on a step');
  return `${added.length ? `New fields: ${added.join(', ')}. ` : ''}${qty}`;
}

export interface SheetRow {
  id: string;
  group: 'held, with a likely reading' | 'held, no likely reading' | 'marked correct, one new field' | 'not reviewed yet';
  label_status: LabelStatus;
  prescription: string;
  v1_line: string;
  flag: string;
  likely_reading: string;
  confidence: string | null;
  basis: string[];
  safety_notes: string[];
  quantity_role: V2Item['quantity_role'];
  quantity_math: string | null;
  your_note: string | null;
  what_changed: string;
  kevin: string;
}

/** True when Kevin still needs to see the item: never reviewed, or v2 adds something his review did not decide. */
export function needsKevin(it: V2Item): boolean {
  return it.label_status === 'proposed' || it.open_questions.length > 0;
}

function groupOf(it: V2Item): SheetRow['group'] {
  if (it.label_status === 'kevin-notes') return it.label.likely_reading ? 'held, with a likely reading' : 'held, no likely reading';
  if (it.label_status === 'confirmed') return 'marked correct, one new field';
  return 'not reviewed yet';
}
const GROUP_ORDER: SheetRow['group'][] = ['held, with a likely reading', 'held, no likely reading', 'marked correct, one new field', 'not reviewed yet'];

/** The confirmation sheet for v2: only the items Kevin still needs to see. */
export function confirmV2(items: V2Item[]): object {
  const rows: SheetRow[] = items
    .filter(needsKevin)
    .sort((a, b) => GROUP_ORDER.indexOf(groupOf(a)) - GROUP_ORDER.indexOf(groupOf(b)) || a.id.localeCompare(b.id))
    .map((it) => {
      const l = it.label;
      const r = l.likely_reading;
      return {
        id: it.id,
        group: groupOf(it),
        label_status: it.label_status,
        prescription: renderPrescription(it.input),
        v1_line: it.source_line,
        flag: l.flag.needed ? `yes: ${l.flag.reasons.map((x) => x.replace(/_/g, ' ')).join(', ')}` : 'no',
        likely_reading: readingText(r),
        confidence: r ? r.confidence : null,
        basis: r ? r.basis.map((b) => `${b.text} (${b.source.replace(/_/g, ' ')})`) : [],
        safety_notes: l.safety_notes.map((n) => n.text),
        quantity_role: it.quantity_role,
        quantity_math: it.quantity_math,
        your_note: it.review.note,
        what_changed: it.label_status === 'proposed' ? it.proposal_note ?? autoChange(it) : it.open_questions.join(' '),
        kevin: '',
      };
    });
  const count = (g: SheetRow['group']) => rows.filter((r) => r.group === g).length;
  return {
    status: 'Sig bench v2. Every row here is a label Kevin has not yet seen in the v2 shape: the 71 lines he has not reviewed, and the reviewed lines where v2 adds something his review did not decide.',
    how_to_answer: 'In kevin, write ok when the row is right, or the correction (for example flag=no, likely=twice daily). For a held row, say whether the flag stands.',
    counts: { rows: rows.length, ...Object.fromEntries(GROUP_ORDER.map((g) => [g, count(g)])) },
    rows,
  };
}

// ─── Rules baseline on both tiers ─────────────────────────────────────────────

export type V2Bucket = 'clean' | 'hard' | 'reviewed' | 'all';

export interface RulesV2Result {
  labels: string;
  baseline: string;
  scorer: string;
  buckets: Record<V2Bucket, V2Summary>;
  lines: Array<{ id: string; tier: string; label_status: string; flagGold: boolean; flagReply: boolean; reasons: string[]; readingScored: boolean; readingAllCorrect: boolean | null; wrongFields: string[] }>;
}

export function rulesV2OnBench(items: V2Item[]): RulesV2Result {
  const buckets: Record<V2Bucket, V2Summary> = { clean: emptySummary(), hard: emptySummary(), reviewed: emptySummary(), all: emptySummary() };
  const lines: RulesV2Result['lines'] = [];
  for (const it of items) {
    const reply = rulesV2(it.input);
    const s = scoreV2Reply(it, JSON.stringify(reply));
    const into: V2Bucket[] = [it.tier, 'all'];
    if (it.label_status !== 'proposed') into.push('reviewed');
    for (const b of into) addScore(buckets[b], s);
    lines.push({
      id: it.id,
      tier: it.tier,
      label_status: it.label_status,
      flagGold: it.label.flag.needed,
      flagReply: reply.flag.needed,
      reasons: reply.flag.reasons,
      readingScored: s.reading !== null,
      readingAllCorrect: s.reading ? s.reading.allCorrect : null,
      wrongFields: s.reading ? READING_FIELDS.filter((f) => !s.reading!.fields[f]) : [],
    });
  }
  return {
    labels: (['confirmed', 'kevin-notes', 'proposed'] as const).map((k) => `${items.filter((i) => i.label_status === k).length} ${k}`).join(', '),
    baseline: 'frozen rules parser (src/eval/sigBaselines.ts) through the v2 wrapper (src/eval/sigBaselinesV2.ts)',
    scorer: 'src/eval/sigBenchV2Score.ts, flag and likely reading scored separately',
    buckets,
    lines,
  };
}

export { renderLine };
