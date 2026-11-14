import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decide, ismpFindings, quoteIn, strengthParts, type DrugFacts, type Reading, type RxInput, type TierTable } from './rules';
import { combineDecisions, scoreSet } from './score';
import { parseTierTable } from '../eval/sigBenchV2';

const tiers = parseTierTable(readFileSync('bench/sig-bench/CLARIFICATION-RULES.md', 'utf8')) as TierTable;

const off = { present: false, quote: null };
function reading(over: Partial<Reading>): Reading {
  return {
    generic: 'examplol', release: 'ir', product_form: 'tablet', form_stated: 'tablet', strength_in_sig: null,
    per_dose: { amount: null, count: { min: 1, max: 1, unit: 'tab' }, quote: '1 tab' },
    schedule: { type: 'fixed', times_per_day: { min: 1, max: 1 }, interval_hours: null, every_days: null, quote: 'daily' },
    phases: [], weekday_pattern: false, frequency_conflict: off, duration_conflict: off, alternatives: off, as_directed: off,
    taper: { mentioned: false }, titration: { mentioned: false }, sliding_scale: { mentioned: false },
    site: { kind: null, side: null }, written_max: { amount_per_day: null, doses_per_day: null }, max_repeats: { value: null },
    duration_days: null, prn_reason: null, ...over,
  };
}
const rx = (over: Partial<RxInput>): RxInput => ({ drug_description: 'Examplol', strength: '10 mg', dosage_form: 'tablet', sig: '1 tab po daily', quantity: { value: 30, unit: 'tab' }, days_supply: 30, ...over });
const facts = (over: Partial<DrugFacts> = {}): DrugFacts => ({ strengths_mg: { examplol: [5, 10, 20] }, schedule: null, label: null, ...over });
const label = (max: number | null, interval: 'weekly' | null = null) => ({ max_daily: max === null ? null : { value: max, unit: 'mg', ingredient: null }, interval_only: interval, quote: 'max quote', title: 'EXAMPLOL TABLET', url: 'u' });
const reasons = (d: ReturnType<typeof decide>) => d.findings.map((f) => f.reason);

describe('rx intake rules', () => {
  it('a clean line needs no call', () => {
    const d = decide(rx({}), reading({}), facts({ label: label(40) }), tiers);
    expect(d.required_call).toBe(false);
    expect(d.findings).toEqual([]);
    expect(d.quantity_math).toContain('30 tab needed');
  });

  it('flags a daily total above the label maximum with a law tier from the table, not the model', () => {
    const d = decide(rx({ sig: '3 tabs po daily', quantity: { value: 90, unit: 'tab' } }), reading({ per_dose: { amount: null, count: { min: 3, max: 3, unit: 'tab' } } }), facts({ label: label(20) }), tiers);
    expect(reasons(d)).toEqual(['exceeds_usual_max']);
    expect(d.tier).toBe('law');
    expect(d.findings[0].rule_ids).toContain('FL-DUR');
  });

  it('as-needed with no written maximum: standard only when the interval allows more than the label maximum', () => {
    const r = reading({ per_dose: { amount: null, count: { min: 2, max: 2, unit: 'tab' } }, schedule: { type: 'prn', times_per_day: null, interval_hours: { min: 4, max: 4 }, every_days: null } });
    const over = decide(rx({ strength: '500 mg', sig: '2 tabs q4h prn pain' }), r, facts({ strengths_mg: { examplol: [500] }, label: label(4000) }), tiers);
    expect(reasons(over)).toEqual(['missing_max_daily']);
    expect(over.tier).toBe('standard');
    const under = decide(rx({ strength: '500 mg', sig: '2 tabs q4h prn pain' }), r, facts({ strengths_mg: { examplol: [500] }, label: label(8000) }), tiers);
    expect(under.required_call).toBe(false);
  });

  it('catches a 1000-fold unit error from marketed strengths', () => {
    const d = decide(rx({ strength: '125 mg' }), reading({}), facts({ strengths_mg: { examplol: [0.0625, 0.125, 0.25] } }), tiers);
    expect(reasons(d)).toEqual(['implausible_dose_unit']);
  });

  it('a weekly product written daily is a mismatch, and its quantity math says so', () => {
    const d = decide(rx({ quantity: { value: 4, unit: 'tab' }, days_supply: 28 }), reading({}), facts({ label: label(null, 'weekly') }), tiers);
    expect(reasons(d)).toEqual(['frequency_product_mismatch']);
    expect(d.findings[0].fact).toContain('weekly use')
  });

  it('a quantity three times the need is a judgment advisory, not a required call', () => {
    const d = decide(rx({ quantity: { value: 90, unit: 'tab' } }), reading({}), facts(), tiers);
    expect(reasons(d)).toEqual(['internal_conflict']);
    expect(d.required_call).toBe(false);
    expect(d.advisory).toBe(true);
  });

  it('ignores a structural conflict whose quote is not in the prescription', () => {
    const r = reading({ frequency_conflict: { present: true, quote: 'daily bid' } });
    expect(decide(rx({}), r, facts(), tiers).required_call).toBe(false);
    expect(reasons(decide(rx({ sig: '1 tab po daily bid' }), r, facts(), tiers))).toEqual(['conflicting_frequency']);
  });

  it('a blank dosage form is law for a scheduled drug and judgment otherwise', () => {
    expect(decide(rx({ dosage_form: null }), reading({ form_stated: null }), facts({ schedule: '4' }), tiers).tier).toBe('law');
    expect(decide(rx({ dosage_form: null }), reading({ form_stated: null }), facts(), tiers).tier).toBe('judgment');
  });

  it('reads ISMP dose designations from the text itself', () => {
    expect(ismpFindings(rx({ sig: 'take 1.0 mg daily' }), null).map((f) => f.rule)).toEqual(['ISMP-TRAILING-ZERO']);
    expect(ismpFindings(rx({ strength: '.5 mg' }), null).map((f) => f.rule)).toEqual(['ISMP-TRAILING-ZERO']);
    expect(ismpFindings(rx({ sig: 'inject 20 U daily' }), null).map((f) => f.rule)).toEqual(['ISMP-U']);
    expect(ismpFindings(rx({ sig: 'inject 20 units daily', strength: '100 units/mL' }), null)).toEqual([]);
    expect(ismpFindings(rx({ sig: '1 gtt OD bid' }), 'eye')).toEqual([]);
    expect(ismpFindings(rx({ sig: '0.5 tab daily', strength: '10 mg' }), null)).toEqual([]);
  });

  it('parses strengths and checks quotes', () => {
    expect(strengthParts('10 mg/325 mg')).toEqual([{ value: 10, unit: 'mg' }, { value: 325, unit: 'mg' }]);
    expect(quoteIn('Daily  BID', rx({ sig: '1 tab daily bid' }))).toBe(true);
    expect(quoteIn(null, rx({}))).toBe(false);
  });

  it('a second reader can add a structural finding but not a facts finding', () => {
    const input = rx({ sig: '1 tab po daily or bid' });
    const a = decide(input, reading({}), facts(), tiers);
    const b = decide(input, reading({ alternatives: { present: true, quote: 'daily or bid' } }), facts(), tiers);
    expect(combineDecisions(input, { opus: a, qwen: b }, 'primary', 'opus')!.required_call).toBe(false);
    const u = combineDecisions(input, { opus: a, qwen: b }, 'union_structural', 'opus')!;
    expect(u.required_call).toBe(true);
    expect(u.tier).toBe('law');
  });

  it('scores a missed required call as a dangerous dispense', () => {
    const clean = decide(rx({}), reading({}), facts(), tiers);
    const s = scoreSet([{ needed: true, reasons: ['missing_frequency'], tier: 'law', bucket: 'required' }], [clean], ['x']);
    expect(s.metrics.required.dangerous).toBe(1);
    expect(s.errors[0].kind).toBe('MISS');
  });
});
