/**
 * Rx Intake Check rules layer. Pure functions, no I/O.
 *
 * A model reads the prescription into a structured reading with quotes (bench/rx-intake/system/
 * extract-user.txt). This file decides whether the prescriber must be called, and why, from that
 * reading, the raw fields and checked facts (RxNorm strengths and DEA schedule, FDA label maximums
 * and weekly-only products from DailyMed). The tier and rule IDs come from the rule that fired,
 * through the tier table in bench/sig-bench/CLARIFICATION-RULES.md, never from the model.
 *
 * A law or standard reason is a required call. A judgment reason is an advisory: the pharmacist
 * may interpret and document (CLARIFICATION-RULES.md, JUDGMENT tier).
 */

export type Tier = 'law' | 'standard' | 'judgment';

export interface RxInput {
  drug_description: string | null;
  strength: string | null;
  dosage_form: string | null;
  sig: string;
  quantity: { value: number; unit: string };
  days_supply: number;
}

interface Span {
  min: number;
  max: number;
  unit?: string;
}
interface Flagged {
  present?: boolean;
  quote?: string | null;
}
export interface Reading {
  generic: string | null;
  release: 'er' | 'dr' | 'ir' | null;
  product_form: string | null;
  form_stated: string | null;
  strength_in_sig: string | null;
  per_dose: { amount: Span | null; count: Span | null; quote?: string | null } | null;
  schedule: { type: 'fixed' | 'prn' | 'fixed_and_prn' | 'single_dose' | 'none'; times_per_day: Span | null; interval_hours: Span | null; every_days: number | null; quote?: string | null } | null;
  phases: Array<{ amount: Span | null; count: Span | null; times_per_day: number | null; days: number | null }>;
  weekday_pattern: boolean;
  frequency_conflict: Flagged;
  duration_conflict: Flagged;
  alternatives: Flagged;
  as_directed: Flagged;
  taper: { mentioned?: boolean; steps_written?: boolean; quote?: string | null };
  titration: { mentioned?: boolean; plan_written?: boolean; quote?: string | null };
  sliding_scale: { mentioned?: boolean; scale_written?: boolean; quote?: string | null };
  site: { kind: string | null; side: string | null; quote?: string | null };
  written_max: { amount_per_day: { value: number; unit: string } | null; doses_per_day: number | null; quote?: string | null };
  max_repeats: { value: number | null; quote?: string | null };
  duration_days: number | null;
  prn_reason: string | null;
}

export interface LabelFact {
  /** Highest maximum adult daily dose the label states, in mg (or units), or in dosage units per day. */
  max_daily: { value: number; unit: string; ingredient: string | null } | null;
  interval_only: 'weekly' | 'monthly' | null;
  /** Single doses (mg) the label gives only weekly or monthly, never daily. */
  weekly_only_doses?: Array<{ mg: number; interval: 'weekly' | 'monthly' }>;
  /** Every mg amount the label text mentions. A maximum in tablets applies only to a strength the label names. */
  mg_mentioned?: number[];
  quote: string | null;
  title: string;
  url: string;
}
export interface DrugFacts {
  /** Marketed strengths of each ingredient in this form family, in mg (mass units only). */
  strengths_mg: Record<string, number[]>;
  schedule: string | null;
  label: LabelFact | null;
  /** DailyMed lists a single-use or preservative-free package beside a multidose one. */
  both_packages?: { single_use_title: string } | null;
}

export interface Finding {
  reason: string;
  tier: Tier;
  rule_ids: string[];
  kind: string;
  fact: string;
  citation: string;
}

export interface Decision {
  required_call: boolean;
  advisory: boolean;
  tier: Tier | null;
  findings: Finding[];
  quantity_math: string | null;
  daily_total: string | null;
  question: string | null;
}

export type TierTable = Map<string, { tier: Tier | null; ruleIds: string[] }>;

const RANK: Record<Tier, number> = { law: 3, standard: 2, judgment: 1 };
const MASS: Record<string, number> = { mg: 1, mcg: 0.001, g: 1000 };
const COUNTED = new Set(['tab', 'cap', 'patch', 'supp']);
const ISMP_URL = 'ISMP List of Error-Prone Abbreviations, Symbols, and Dose Designations (2024)';

const blank = (s: string | null | undefined) => !s || !String(s).trim() || /^none$/i.test(String(s).trim());
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** True when a model quote really appears in the prescription. Guards structural findings against invented text. */
export function quoteIn(quote: string | null | undefined, input: RxInput): boolean {
  if (!quote) return false;
  const hay = norm([input.drug_description, input.strength, input.dosage_form, input.sig].filter(Boolean).join(' | '));
  return hay.includes(norm(quote));
}

/** Strength field parts in mg, in written order: "10 mg/325 mg" gives [10, 325]. Null parts are not mass. */
export function strengthParts(s: string | null): Array<{ value: number; unit: string } | null> {
  if (blank(s)) return [];
  return String(s)
    .split('/')
    .map((p) => {
      const m = p.match(/(\d*\.?\d+)\s*(mg|mcg|g|units?|meq|%)?/i);
      if (!m) return null;
      return { value: Number(m[1]), unit: (m[2] ?? '').toLowerCase() };
    });
}

/** Deterministic ISMP dose-designation checks on the written text. */
export function ismpFindings(input: RxInput, siteKind: string | null): Array<{ token: string; why: string; rule: string }> {
  const text = [input.strength, input.sig].filter(Boolean).join(' ');
  const out: Array<{ token: string; why: string; rule: string }> = [];
  const trailing = text.match(/(?<![\d.])\d+\.0(?![\d])/);
  if (trailing) out.push({ token: trailing[0], why: `"${trailing[0]}" has a trailing zero and can be read as ten times the dose`, rule: 'ISMP-TRAILING-ZERO' });
  const naked = text.match(/(?<![\d])\.\d+/);
  if (naked) out.push({ token: naked[0], why: `"${naked[0]}" has no leading zero and can be read as a whole number`, rule: 'ISMP-TRAILING-ZERO' });
  const u = input.sig.match(/\d\s*(u|U|IU)\b/);
  if (u) out.push({ token: u[0], why: `"${u[0]}" abbreviates units, which can be read as 0, 4 or cc`, rule: 'ISMP-U' });
  if (/[µμ]g/.test(text)) out.push({ token: 'µg', why: '"µg" can be read as mg', rule: 'ISMP-MCG' });
  if (/\bOD\b/.test(input.sig) && siteKind !== 'eye') out.push({ token: 'OD', why: '"OD" can mean right eye or once daily, and this is not an eye product', rule: 'ISMP-OD' });
  return out;
}

function perDoseMg(r: Reading, input: RxInput, ingredientIndex: number): number | null {
  const pd = r.per_dose;
  const parts = strengthParts(input.strength);
  const part = parts[ingredientIndex] ?? (parts.length === 1 ? parts[0] : null);
  if (pd?.count && part && part.unit in MASS && ['tab', 'cap', 'supp', 'patch'].includes(pd.count.unit ?? '')) return pd.count.max * part.value * MASS[part.unit];
  if (pd?.amount && pd.amount.unit && pd.amount.unit in MASS && ingredientIndex === 0) return pd.amount.max * MASS[pd.amount.unit];
  return null;
}

function countPerDose(r: Reading, input: RxInput): number | null {
  const pd = r.per_dose;
  if (pd?.count && COUNTED.has(pd.count.unit ?? '')) return pd.count.max;
  const parts = strengthParts(input.strength);
  if (pd?.amount && parts.length === 1 && parts[0] && parts[0].unit in MASS && pd.amount.unit && pd.amount.unit in MASS) return (pd.amount.max * MASS[pd.amount.unit]) / (parts[0].value * MASS[parts[0].unit]);
  return null;
}

/** Most doses a day the schedule allows: times a day, or 24 hours divided by the shortest interval. */
function dosesPerDay(r: Reading): number | null {
  const s = r.schedule;
  if (!s) return null;
  if (s.times_per_day) return s.times_per_day.max / (s.every_days && s.every_days > 1 ? s.every_days : 1);
  if (s.interval_hours && s.interval_hours.min > 0) return Math.floor(24 / s.interval_hours.min + 1e-9);
  if (s.every_days && s.every_days >= 1) return 1 / s.every_days;
  return null;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

export function decide(input: RxInput, r: Reading, facts: DrugFacts | null, tiers: TierTable): Decision {
  const found: Array<Omit<Finding, 'tier' | 'rule_ids'> & { tier?: Tier }> = [];
  const add = (reason: string, kind: string, fact: string, citation: string, tier?: Tier) => {
    if (!found.some((f) => f.reason === reason)) found.push({ reason, kind, fact, citation, tier });
  };
  const sig = input.sig;
  const fl = 's. 456.42(1), F.S. (FL-RX-DIRECTIONS)';
  const dosePack = /dose ?pa?c?k|dosepak|\bpack(age)?\b/i.test([input.drug_description, sig].join(' ')) && !!r.as_directed?.present;

  if (blank(input.drug_description) && !r.generic) add('missing_drug', 'missing_element', 'The drug field is blank and the sig names no drug.', fl);
  if (blank(input.strength) && blank(r.strength_in_sig)) add('missing_strength', 'missing_element', 'The strength field is blank and the sig gives no strength.', fl);

  const quotedDose = !!r.per_dose?.quote && /\d|\bone\b|\btwo\b|\bhalf\b/i.test(r.per_dose.quote) && quoteIn(r.per_dose.quote, input);
  const noDose = !r.per_dose?.amount && !r.per_dose?.count && !(r.phases?.length) && !quotedDose;
  const noSchedule = (!r.schedule || r.schedule.type === 'none') && !(r.phases?.length);
  if (noDose && !dosePack) add('missing_dose', 'missing_element', 'Neither the sig nor the fields say how much to take each time.', fl);
  if (noSchedule && !dosePack) add('missing_frequency', 'missing_element', 'The sig gives no schedule, interval or as-needed use.', fl);
  if (r.as_directed?.present && !dosePack && (noDose || noSchedule)) add('as_directed_without_instructions', 'missing_element', `"${r.as_directed.quote ?? 'as directed'}" stands in for a missing ${noDose ? 'dose' : 'schedule'}.`, 'NCPDP SCRIPT Implementation Recommendations v1.77, section 10 (NCPDP-SIG-INCOMPLETE)');
  if ((r.site?.kind === 'eye' || r.site?.kind === 'ear') && !r.site.side) add('missing_laterality', 'missing_element', `An ${r.site.kind} product with no ${r.site.kind} named.`, fl);
  if (r.taper?.mentioned && !r.taper.steps_written) add('missing_taper_steps', 'structure', `"${r.taper.quote ?? 'taper'}" without the steps.`, fl);
  if (r.titration?.mentioned && !r.titration.plan_written) add('missing_titration_plan', 'structure', `"${r.titration.quote ?? 'increase'}" without the step, interval and ceiling.`, fl);
  if (r.sliding_scale?.mentioned && !r.sliding_scale.scale_written) add('missing_sliding_scale', 'structure', `"${r.sliding_scale.quote ?? 'sliding scale'}" without the scale.`, fl);
  if (r.frequency_conflict?.present && quoteIn(r.frequency_conflict.quote, input)) add('conflicting_frequency', 'structure', `"${r.frequency_conflict.quote}" gives two schedules for one dose.`, fl);
  if (r.duration_conflict?.present && quoteIn(r.duration_conflict.quote, input)) add('conflicting_duration', 'structure', `"${r.duration_conflict.quote}" gives two durations for one step.`, fl);
  if (r.alternatives?.present && quoteIn(r.alternatives.quote, input)) add('alternatives_without_rule', 'structure', `"${r.alternatives.quote}" leaves the choice open.`, fl);

  // Dosage form: judgment, or law for a DEA-scheduled drug.
  if (blank(input.dosage_form) && blank(r.form_stated)) {
    if (facts?.schedule) add('dosage_form_unspecified', 'controlled_schedule', `No dosage form, and RxNorm lists this drug in DEA schedule ${facts.schedule}.`, '21 CFR 1306.05(a) (FED-CS-CONTENT), RxNorm', 'law');
    else add('dosage_form_unspecified', 'missing_element', 'No dosage form is given.', 'NABP Model Rules (NABP-RX-CONTENT)', 'judgment');
  }

  // Unit plausibility against RxNorm strengths.
  const parts = strengthParts(input.strength);
  const ingNames = facts ? Object.keys(facts.strengths_mg) : [];
  parts.forEach((p, i) => {
    if (!p || !(p.unit in MASS) || !facts) return;
    const marketed = facts.strengths_mg[ingNames[i] ?? ingNames[0]] ?? [];
    if (!marketed.length) return;
    const mg = p.value * MASS[p.unit];
    const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, a, b);
    if (!marketed.some((m) => near(m, mg)) && marketed.some((m) => near(m, mg / 1000) || near(m, mg * 1000))) {
      add('implausible_dose_unit', 'unit_strength', `${p.value} ${p.unit} is not a marketed strength, but ${fmt(p.unit === 'mg' ? p.value : p.value)} ${p.unit === 'mg' ? 'mcg' : 'mg'} is (RxNorm lists ${marketed.map(fmt).join(', ')} mg).`, 'RxNorm clinical drugs (rxnav.nlm.nih.gov), FDA labels on DailyMed');
    }
  });

  // Daily totals against the FDA label maximum.
  let dailyTotal: string | null = null;
  const lab = facts?.label ?? null;
  const per = dosesPerDay(r);
  if (lab?.max_daily && !found.some((f) => f.reason === 'implausible_dose_unit')) {
    const unit = lab.max_daily.unit.toLowerCase();
    const byCount = ['tablet', 'tablets', 'tab', 'capsule', 'capsules', 'cap', 'dose', 'doses'].includes(unit);
    const ingIndex = Math.max(0, lab.max_daily.ingredient ? ingNames.findIndex((n) => n.includes(String(lab.max_daily!.ingredient).toLowerCase().split(' ')[0])) : 0);
    const firstPart = strengthParts(input.strength)[0];
    const countApplies = !byCount || (!!firstPart && firstPart.unit === 'mg' && (lab.mg_mentioned ?? []).some((m) => Math.abs(m - firstPart.value) < 1e-9));
    const one = !countApplies ? null : byCount ? countPerDose(r, input) : perDoseMg(r, input, ingIndex);
    const maxVal = byCount ? lab.max_daily.value : unit in MASS ? lab.max_daily.value * MASS[unit] : null;
    const phaseMax = (byCount && !countApplies ? [] : r.phases ?? []).reduce((m, p) => {
      const c = byCount ? p.count?.max ?? null : p.amount && p.amount.unit && p.amount.unit in MASS ? p.amount.max * MASS[p.amount.unit] : null;
      return c !== null && p.times_per_day ? Math.max(m, c * p.times_per_day) : m;
    }, 0);
    const u = byCount ? lab.max_daily.unit : 'mg';
    const cite = `FDA label on DailyMed: ${lab.title}${lab.quote ? `, "${lab.quote}"` : ''}`;
    if (maxVal !== null) {
      const wm = r.written_max;
      const writtenDaily = wm?.amount_per_day && wm.amount_per_day.unit?.toLowerCase() in MASS && !byCount ? wm.amount_per_day.value * MASS[wm.amount_per_day.unit.toLowerCase()] : wm?.doses_per_day && one !== null ? wm.doses_per_day * one : null;
      const type = r.schedule?.type;
      if (one !== null && per !== null && (type === 'fixed' || type === 'fixed_and_prn')) {
        const total = Math.max(one * per, phaseMax);
        dailyTotal = `${fmt(one)} ${u} x ${fmt(per)} a day = ${fmt(total)} ${u}. Label maximum ${fmt(maxVal)} ${u}.`;
        if (total > maxVal + 1e-9) add('exceeds_usual_max', 'fda_max', dailyTotal, cite);
      } else if (phaseMax > maxVal + 1e-9) {
        dailyTotal = `Highest step ${fmt(phaseMax)} ${u} a day. Label maximum ${fmt(maxVal)} ${u}.`;
        add('exceeds_usual_max', 'fda_max', dailyTotal, cite);
      } else if (type === 'prn') {
        if (writtenDaily !== null) {
          dailyTotal = `Written maximum ${fmt(writtenDaily)} ${u} a day. Label maximum ${fmt(maxVal)} ${u}.`;
          if (writtenDaily > maxVal + 1e-9) add('exceeds_usual_max', 'fda_max', dailyTotal, cite);
        } else if (one !== null && per !== null) {
          const most = one * per;
          dailyTotal = `${fmt(one)} ${u} up to ${fmt(per)} times a day allows ${fmt(most)} ${u}. Label maximum ${fmt(maxVal)} ${u}. No daily maximum is written.`;
          if (most > maxVal + 1e-9) add('missing_max_daily', 'fda_max', dailyTotal, cite);
        }
      }
    }
  }

  // Weekly or monthly products written with a daily schedule.
  const qty = input.quantity;
  const fixedPerDay = r.schedule && (r.schedule.type === 'fixed' || r.schedule.type === 'fixed_and_prn') ? per : null;
  const doseMg = perDoseMg(r, input, 0);
  const weeklyDose = doseMg !== null ? (lab?.weekly_only_doses ?? []).find((w) => Math.abs(w.mg - doseMg) < 1e-6) : undefined;
  const interval = lab?.interval_only ?? weeklyDose?.interval ?? null;
  if (interval && fixedPerDay !== null && fixedPerDay >= 1 && !r.weekday_pattern) {
    add('frequency_product_mismatch', 'weekly_product', `The label gives ${weeklyDose && !lab?.interval_only ? `the ${fmt(weeklyDose.mg)} mg dose` : 'this product'} only ${interval}, and the sig says ${fmt(fixedPerDay)} time${fixedPerDay === 1 ? '' : 's'} a day.`, `FDA label on DailyMed: ${lab!.title}`);
  }

  // Quantity and days supply for counted forms on a fixed schedule.
  let quantityMath: string | null = null;
  const c1 = countPerDose(r, input);
  if (COUNTED.has(qty.unit) && r.schedule?.type === 'fixed' && !r.weekday_pattern) {
    let need: number | null = null;
    if (r.phases?.length) {
      let used = 0;
      let total = 0;
      let ok = true;
      for (const p of r.phases) {
        const c = p.count && COUNTED.has(p.count.unit ?? '') ? p.count.max : null;
        if (c === null || !p.times_per_day) {
          ok = false;
          break;
        }
        const d = p.days ?? Math.max(0, input.days_supply - used);
        used += d;
        total += c * p.times_per_day * d;
      }
      if (ok) need = total;
    } else if (c1 !== null && per !== null) need = c1 * per * Math.min(input.days_supply, r.duration_days ?? input.days_supply);
    if (need !== null && need > 0) {
      const ratio = qty.value / need;
      quantityMath = `${fmt(need)} ${qty.unit} needed for ${input.days_supply} days, ${fmt(qty.value)} written (${fmt(Math.round(ratio * 100) / 100)} times the need).`;
      if (interval && ratio < 0.5) {
        const f = found.find((x) => x.reason === 'frequency_product_mismatch');
        if (f) f.fact += ` The quantity fits ${interval} use: ${quantityMath}`;
      } else if (ratio > 2 || ratio < 0.5) add('internal_conflict', 'arithmetic', `Quantity and days supply disagree with the sig. ${quantityMath}`, 'Florida DUR rule, r. 64B16-27.810, F.A.C. (FL-DUR)');
    }
  }

  // A repeat limit below the written daily maximum.
  const mr = r.max_repeats?.value;
  const one0 = perDoseMg(r, input, 0);
  const wmax = r.written_max?.amount_per_day;
  if (mr !== null && mr !== undefined && one0 !== null && wmax && wmax.unit?.toLowerCase() in MASS) {
    const allowed = one0 * (1 + mr);
    const written = wmax.value * MASS[wmax.unit.toLowerCase()];
    if (written > allowed + 1e-9) add('internal_conflict', 'judgment', `The repeat limit allows ${fmt(allowed)} mg a day, below the written maximum of ${fmt(written)} mg. The stricter limit can be followed.`, 'Florida DUR rule, r. 64B16-27.810, F.A.C. (FL-DUR)');
  }

  const pkgWords = /multi-?dose|single[- ]use|unit[- ]dose|vials?\b|bottle|preservative[- ]free|\bPF\b/i;
  if (r.site?.kind === 'eye' && facts?.both_packages && !pkgWords.test([input.drug_description, input.dosage_form, input.sig].join(' '))) {
    add('package_unspecified', 'judgment', `No package is given, and DailyMed lists a single-use package (${facts.both_packages.single_use_title}) beside the multidose one.`, 'Kevin Madden review, 13 November 2026 (timolol), r. 64B16-27.800, F.A.C. (FL-PT-RECORD)');
  }

  for (const f of ismpFindings(input, r.site?.kind ?? null)) add('error_prone_abbreviation', 'ismp', f.why, `${ISMP_URL} (${f.rule})`);

  // Assign tiers and rule IDs from the table. The dosage form tier was set by its rule above.
  const findings: Finding[] = found.map((f) => {
    const row = tiers.get(f.reason);
    const tier = f.tier ?? row?.tier ?? 'judgment';
    return { reason: f.reason, tier, rule_ids: row?.ruleIds ?? [], kind: f.kind, fact: f.fact, citation: f.citation };
  });
  const tier = findings.reduce<Tier | null>((t, f) => (t === null || RANK[f.tier] > RANK[t] ? f.tier : t), null);
  const required = findings.some((f) => f.tier === 'law' || f.tier === 'standard');
  return { required_call: required, advisory: !required && findings.length > 0, tier, findings, quantity_math: quantityMath, daily_total: dailyTotal, question: questionFor(input, findings) };
}

const ASK: Record<string, string> = {
  missing_drug: 'Which drug did you intend?',
  missing_strength: 'What strength did you intend?',
  missing_dose: 'How much should the patient take each time?',
  missing_frequency: 'How often should the patient take it?',
  missing_laterality: 'Which side should it be used in: left, right or both?',
  missing_taper_steps: 'What are the taper steps: each dose and how many days at each?',
  missing_titration_plan: 'What is the titration plan: the step size, how often to increase, and the maximum dose?',
  missing_sliding_scale: 'What sliding scale should the patient follow: each glucose range and its dose?',
  as_directed_without_instructions: 'Can you give the full directions in place of "as directed"?',
  conflicting_frequency: 'The sig gives two schedules. Which one did you intend?',
  conflicting_duration: 'The sig gives two durations. Which one did you intend?',
  alternatives_without_rule: 'The sig offers a choice. Which should the patient use, or what decides it?',
  implausible_dose_unit: 'The strength is not made in that unit. Did you intend the other unit?',
  exceeds_usual_max: 'The daily total is above the labeled maximum. Can you confirm the intended dose?',
  frequency_product_mismatch: 'This product is labeled for less frequent dosing. Can you confirm the intended schedule?',
  missing_max_daily: 'As written, the patient could take more than the labeled daily maximum. What daily maximum should the label carry?',
  error_prone_abbreviation: 'The sig uses an error-prone abbreviation. Can you confirm the intended dose or meaning?',
  dosage_form_unspecified: 'Which dosage form did you intend?',
  package_unspecified: 'Which package did you intend: multidose bottle or single-use vials?',
  internal_conflict: 'Parts of the prescription disagree. Can you confirm the intended directions?',
};

/** A drafted question to the prescriber, from the findings in order of tier. */
export function questionFor(input: RxInput, findings: Finding[]): string | null {
  if (!findings.length) return null;
  const sorted = [...findings].sort((a, b) => RANK[b.tier] - RANK[a.tier]);
  const what = [input.drug_description, input.strength, input.dosage_form].filter((x) => !blank(x)).join(' ') || 'this prescription';
  const asks = sorted.map((f) => ASK[f.reason] ?? 'Can you clarify?').filter((q, i, all) => all.indexOf(q) === i);
  return `Regarding ${what}, sig "${input.sig}": ${asks.join(' ')}`;
}
