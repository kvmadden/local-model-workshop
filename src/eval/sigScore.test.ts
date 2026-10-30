import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parsePrediction, scoreCase, percentile, summarize, SigGold, SIG_FIELDS } from './sigScore';

const gold: SigGold = {
  id: 't1',
  drug: 'metoprolol tartrate',
  drug_match: 'metoprolol',
  dose_per_administration: { value: 25, unit: 'mg' },
  frequency: 'every_12_hours',
  timing: null,
  prn: false,
  prn_indication: null,
};

const reply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    drug: 'Metoprolol tartrate',
    dose_per_administration: { value: 25, unit: 'mg' },
    frequency: 'every_12_hours',
    timing: null,
    prn: false,
    prn_indication: null,
    ...over,
  });

// The three instructions the schema exists to tell apart.
const prnOnly: SigGold = {
  id: 'p1',
  drug: 'examplamine',
  drug_match: 'examplamine',
  dose_per_administration: { value: 10, unit: 'mg' },
  frequency: null,
  timing: null,
  prn: true,
  prn_indication: 'headache',
};
const dailyOnly: SigGold = { ...prnOnly, id: 'p2', frequency: 'once_daily', prn: false, prn_indication: null };
const dailyPrn: SigGold = { ...prnOnly, id: 'p3', frequency: 'once_daily', prn: true, prn_indication: 'headache' };
const answerFor = (g: SigGold) =>
  JSON.stringify({
    drug: 'Examplamine',
    dose_per_administration: g.dose_per_administration,
    frequency: g.frequency,
    timing: g.timing,
    prn: g.prn,
    prn_indication: g.prn_indication,
  });

describe('sig extraction scorer', () => {
  it('scores an exact JSON reply as fully correct on every field', () => {
    const s = scoreCase(gold, reply());
    expect(s).toMatchObject({ parsed: true, drug: true, dose: true, frequency: true, timing: true, prn: true, prn_indication: true, allCorrect: true });
  });

  it('accepts numeric strings, unit aliases and spaced labels', () => {
    const s = scoreCase(gold, 'Answer: ' + reply({ drug: 'metoprolol', dose_per_administration: { value: '25', unit: 'MG' }, frequency: 'every 12 hours' }));
    expect(s.allCorrect).toBe(true);
  });

  it('marks a wrong dose and a near-miss frequency as wrong', () => {
    const s = scoreCase(gold, reply({ dose_per_administration: { value: 50, unit: 'mg' }, frequency: 'twice_daily' }));
    expect(s).toMatchObject({ drug: true, dose: false, frequency: false, timing: true, prn: true, allCorrect: false });
  });

  it('rejects a flat dose instead of the dose object', () => {
    const s = scoreCase(gold, reply({ dose_per_administration: 25 }));
    expect(s.dose).toBe(false);
  });

  it('requires the drug token as a whole word', () => {
    expect(scoreCase(gold, reply({ drug: 'metoprololx' })).drug).toBe(false);
  });

  it('tells "as needed", "once daily" and "once daily as needed" apart', () => {
    const golds = [prnOnly, dailyOnly, dailyPrn];
    for (const g of golds) {
      for (const other of golds) {
        expect(scoreCase(g, answerFor(other)).allCorrect).toBe(g === other);
      }
    }
    // The specific single-field errors.
    expect(scoreCase(dailyPrn, answerFor(prnOnly))).toMatchObject({ frequency: false, prn: true, prn_indication: true });
    expect(scoreCase(dailyPrn, answerFor(dailyOnly))).toMatchObject({ frequency: true, prn: false, prn_indication: false });
  });

  it('treats null as a value: a null frequency or timing is wrong when gold has one, and vice versa', () => {
    expect(scoreCase(gold, reply({ frequency: null })).frequency).toBe(false);
    expect(scoreCase(gold, reply({ timing: 'evening' })).timing).toBe(false);
    expect(scoreCase(prnOnly, answerFor({ ...prnOnly, frequency: 'once_daily' })).frequency).toBe(false);
    // A missing key is not the same as null.
    expect(scoreCase(gold, JSON.stringify({ drug: 'metoprolol', dose_per_administration: { value: 25, unit: 'mg' }, frequency: 'every_12_hours', prn: false, prn_indication: null })).timing).toBe(false);
  });

  it('scores timing separately from frequency', () => {
    const bedtime: SigGold = { ...dailyOnly, id: 'b1', timing: 'bedtime' };
    expect(scoreCase(bedtime, answerFor({ ...bedtime, timing: null }))).toMatchObject({ frequency: true, timing: false, allCorrect: false });
    expect(scoreCase(bedtime, answerFor(bedtime)).allCorrect).toBe(true);
  });

  it('requires a real boolean for prn', () => {
    expect(scoreCase(gold, reply({ prn: 'false' })).prn).toBe(false);
  });

  it('matches the prn indication by whole words and treats empty as none', () => {
    expect(scoreCase(prnOnly, answerFor({ ...prnOnly, prn_indication: 'for Headache' })).prn_indication).toBe(true);
    expect(scoreCase(prnOnly, answerFor({ ...prnOnly, prn_indication: 'pain' })).prn_indication).toBe(false);
    expect(scoreCase(prnOnly, answerFor({ ...prnOnly, prn_indication: null })).prn_indication).toBe(false);
    expect(scoreCase(gold, reply({ prn_indication: '' })).prn_indication).toBe(true);
    expect(scoreCase(gold, reply({ prn_indication: 'pain' })).prn_indication).toBe(false);
  });

  it('gives no credit to an echo of the prompt (the mock baseline)', () => {
    const s = scoreCase(gold, '[Mock Echo] You extract structured fields... Line: Metoprolol tartrate 25 mg tablet');
    expect(s.parsed).toBe(false);
    for (const k of SIG_FIELDS) expect(s[k]).toBe(false);
    expect(s.allCorrect).toBe(false);
  });

  it('computes nearest-rank percentiles', () => {
    const v = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(10);
    expect(percentile(v, 95)).toBe(19);
    expect(percentile([], 50)).toBeNull();
  });

  it('summarizes counts per field', () => {
    const a = scoreCase(gold, reply());
    const b = scoreCase(gold, reply({ timing: 'morning' }));
    const c = scoreCase(gold, 'not json');
    expect(summarize([a, b, c])).toEqual({ n: 3, parsed: 2, drug: 2, dose: 2, frequency: 2, timing: 1, prn: 2, prn_indication: 2, allCorrect: 1 });
  });

  it('parsePrediction rejects arrays and non-JSON', () => {
    expect(parsePrediction('[1,2]')).toBeNull();
    expect(parsePrediction('hello')).toBeNull();
  });

  it('gold file is internally consistent with the case file and the schema', () => {
    const dir = path.resolve(__dirname, '../../eval/sig-extraction');
    const read = (f: string) =>
      readFileSync(path.join(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const cases = read('cases.jsonl');
    const golds = read('gold.jsonl') as SigGold[];
    expect(cases).toHaveLength(25);
    expect(golds.map((g) => g.id)).toEqual(cases.map((c: { id: string }) => c.id));
    const schema = JSON.parse(readFileSync(path.join(dir, 'schema.json'), 'utf8'));
    const props = schema.properties;
    expect(schema.required).toEqual(['drug', 'dose_per_administration', 'frequency', 'timing', 'prn', 'prn_indication']);
    for (const g of golds) {
      const input = cases.find((c: { id: string }) => c.id === g.id).input.toLowerCase();
      expect(props.frequency.enum).toContain(g.frequency);
      expect(props.timing.enum).toContain(g.timing);
      expect(props.dose_per_administration.properties.unit.enum).toContain(g.dose_per_administration.unit);
      expect(typeof g.dose_per_administration.value).toBe('number');
      expect(typeof g.prn).toBe('boolean');
      for (const w of g.drug_match.split(' ')) expect(input).toContain(w);
      // PRN labels agree with the text: prn is true exactly when the line says "as needed" or "prn".
      expect(g.prn).toBe(/as needed|\bprn\b/.test(input));
      // An indication only appears on PRN lines, and it is copied from the line.
      if (g.prn_indication !== null) {
        expect(g.prn).toBe(true);
        expect(input).toContain(g.prn_indication);
      }
      // Null frequency is reserved for PRN-only lines.
      if (g.frequency === null) expect(g.prn).toBe(true);
    }
  });
});
