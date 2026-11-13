/**
 * The rules baseline in the v2 reply shape. It is not a new parser.
 *
 * The frozen rules parser (sigBaselines.ts, pinned by eval/fresh-blind-set/lock.json) reads the
 * drug, strength and sig as one line, as it always has. This wrapper puts its six fields into a v2
 * likely reading, copies the dosage form from the e-prescription field, and reads a count and unit
 * per dose with one pattern. Everything else stays null.
 *
 * Flag reasons come from plain patterns on the input, and the wrapper flags when any of them fires:
 * a blank drug or strength field, "ud" or "as directed", no schedule and no as-needed use, two
 * schedule words, or two durations. It does not know drug norms, maximum doses or weekly products,
 * on purpose: it is the floor, not a contender.
 */
import { rulesSig } from './sigBaselines';
import type { V2Input, V2Label, V2Reading } from './sigBenchV2Score';

const FORMS = new Set([
  'tablet', 'orally_disintegrating_tablet', 'capsule', 'solution', 'suspension', 'syrup', 'powder', 'cream', 'ointment',
  'transdermal_patch', 'suppository', 'inhalation_aerosol', 'nasal_spray', 'injection', 'kit',
]);

const COUNT = /(\d+\/\d+|½|\d+(?:\.\d+)?)\s*(tabs?|tablets?|caps?|capsules?|ml|gtts?|drops?|puffs?|sprays?|units?|patch(?:es)?|supps?)\b/i;
const UNIT: Record<string, string> = { tab: 'tab', tablet: 'tab', cap: 'cap', capsule: 'cap', ml: 'mL', gtt: 'gtt', drop: 'gtt', puff: 'puff', spray: 'spray', unit: 'unit', patch: 'patch', supp: 'supp' };

function countPerDose(sig: string): V2Reading['quantity'] {
  const m = sig.match(COUNT);
  if (!m) return null;
  const raw = m[1];
  const n = raw === '½' ? 0.5 : raw.includes('/') ? Number(raw.split('/')[0]) / Number(raw.split('/')[1]) : Number(raw);
  const word = m[2].toLowerCase().replace(/(?:es|s)$/, '');
  const unit = UNIT[word];
  return unit && Number.isFinite(n) ? { min: n, max: n, unit } : null;
}

const SCHEDULE_WORDS = /\b(qd|daily|bid|tid|qid|qhs|qam|qpm|q\d+h|once a day|twice daily|three times a day|four times a day)\b/gi;
const CANON: Record<string, string> = { daily: 'qd', 'once a day': 'qd', 'twice daily': 'bid', 'three times a day': 'tid', 'four times a day': 'qid' };

export function rulesV2(input: V2Input): V2Label {
  const line = [input.drug_description, input.strength, input.sig].filter((x) => x).join(' ');
  const raw = rulesSig(line, { bedtimeAsNeeded: 'no-schedule' }).prediction;
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  const p = { drug: str(raw.drug), frequency: str(raw.frequency), timing: str(raw.timing), prn: raw.prn === true, prn_indication: str(raw.prn_indication) };
  const dose = raw.dose_per_administration as { value: number; unit: string } | null | undefined;
  const reasons: string[] = [];
  if (!input.drug_description) reasons.push('missing_drug');
  if (!input.strength) reasons.push('missing_strength');
  if (/\b(?:ud|as directed)\b/i.test(input.sig)) reasons.push('as_directed_without_instructions');
  if (p.frequency === null && !p.prn) reasons.push('missing_frequency');
  const schedules = new Set([...input.sig.matchAll(SCHEDULE_WORDS)].map((m) => CANON[m[0].toLowerCase()] ?? m[0].toLowerCase()));
  if (schedules.size >= 2) reasons.push('conflicting_frequency');
  if ((input.sig.match(/\bx\s*\d+\s*(?:days?|d)\b/gi) ?? []).length >= 2) reasons.push('conflicting_duration');
  const reading: V2Reading = {
    drug: p.drug,
    dosage_form: input.dosage_form && FORMS.has(input.dosage_form) ? input.dosage_form : null,
    package: null,
    route: null,
    laterality: null,
    concentration: null,
    dose: dose && Number.isFinite(dose.value) && dose.value > 0 ? { min: dose.value, max: dose.value, unit: dose.unit } : null,
    quantity: countPerDose(input.sig),
    application_amount: null,
    frequency: p.frequency,
    frequency_range: null,
    timing: p.timing,
    prn: p.prn,
    prn_indication: p.prn_indication,
    prn_interval: null,
    limits: { max_daily_dose: null, max_doses_per_day: null, max_doses_in_window: null, max_repeats: null },
    duration_days: null,
    days_of_week: null,
    weekly_schedule: null,
    phases: null,
    sliding_scale: null,
    basis: [{ kind: 'as_written', text: 'Rules parser output.', source: 'sig_text' }],
    confidence: reasons.length ? 'low' : 'high',
  };
  return { flag: { needed: reasons.length > 0, reasons }, likely_reading: reading, safety_notes: [] };
}
