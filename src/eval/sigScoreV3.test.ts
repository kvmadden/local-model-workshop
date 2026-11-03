import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  scoreCaseV3,
  drugMatches,
  reasonMatches,
  doseMatchesV3,
  normalizeUnitV3,
  strictNumber,
  parsePredictionV3,
  schemaProblems,
  summarizeV3,
  wordTokens,
} from './sigScoreV3';
import type { SigGold } from './sigScore';

const readJsonl = (f: string) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const cases = readJsonl('eval/sig-extraction/cases.jsonl') as { id: string; input: string }[];
const golds = readJsonl('eval/sig-extraction/gold.jsonl') as SigGold[];
const schema = JSON.parse(readFileSync('eval/sig-extraction/schema.json', 'utf8'));
const gold = (id: string) => golds.find((g) => g.id === id)!;
const input = (id: string) => cases.find((c) => c.id === id)!.input;
const exact = (g: SigGold, over: Record<string, unknown> = {}) =>
  JSON.stringify({ drug: g.drug, dose_per_administration: g.dose_per_administration, frequency: g.frequency, timing: g.timing, prn: g.prn, prn_indication: g.prn_indication, ...over });

describe('scorer v3: drug identity', () => {
  it('gives no credit for copying the input line into the drug field (v2 gave 25 of 25)', () => {
    for (const c of cases) {
      const g = gold(c.id);
      expect(scoreCaseV3(g, exact(g, { drug: c.input }), c.input).drug, c.id).toBe(false);
    }
  });
  it.each([
    ['s17', 'metoprolol succinate', 'a different salt (extended release)'],
    ['s21', 'fluticasone furoate', 'a different ester'],
    ['s23', 'not warfarin', 'a negation'],
    ['s01', 'lisinopril/hydrochlorothiazide', 'a combination product'],
    ['s24', 'hydroxyzine OR insulin', 'an unresolved alternative'],
    ['s24', 'hydroxyzine and warfarin', 'an extra drug'],
    ['s24', 'hydroxyzine pamoate', 'a salt the line does not use'],
    ['s17', 'metoprolol', 'a salt the gold names but the reply drops'],
    ['s01', 'Lisinopril 10 mg', 'a strength inside the name'],
  ])('rejects %s answered as "%s" (%s)', (id, reply) => {
    expect(drugMatches(reply, gold(id).drug, input(id))).toBe(false);
  });
  it('accepts the names the models actually returned, including salts and forms the line uses', () => {
    expect(drugMatches('Hydroxyzine HCl', 'hydroxyzine', input('s24'))).toBe(true);
    expect(drugMatches('Albuterol HFA', 'albuterol', input('s06'))).toBe(true);
    expect(drugMatches('Insulin glargine', 'insulin glargine', input('s11'))).toBe(true);
    expect(drugMatches('Metoprolol tartrate', 'metoprolol tartrate', input('s17'))).toBe(true);
  });
  it('tokenizes gold and reply the same way, so hyphens and digits in names work', () => {
    expect(drugMatches('Co-amoxiclav', 'co-amoxiclav', 'Co-amoxiclav 500/125 mg tab')).toBe(true);
    expect(drugMatches('Vitamin D3', 'vitamin d3', 'Vitamin D3 1000 units daily')).toBe(true);
    expect(wordTokens('Co-Amoxiclav (875/125)')).toEqual(['co', 'amoxiclav', '875', '125']);
  });
});

describe('scorer v3: as-needed reason', () => {
  it.each([
    ['pain', 'chest pain'],
    ['chest pain', 'no chest pain'],
    ['sleep', 'sleep apnea'],
    ['itching', 'not itching'],
    ['itching', 'itching and chest pain'],
  ])('gold "%s" rejects reply "%s"', (g, reply) => {
    expect(reasonMatches(reply, g)).toBe(false);
  });
  it('accepts filler words around the same reason and treats empty as none', () => {
    expect(reasonMatches('for Headache', 'headache')).toBe(true);
    expect(reasonMatches('as needed for chest pain', 'chest pain')).toBe(true);
    expect(reasonMatches('break-through pain', 'break-through pain')).toBe(true);
    expect(reasonMatches('', null)).toBe(true);
    expect(reasonMatches(null, null)).toBe(true);
    expect(reasonMatches('pain', null)).toBe(false);
    expect(reasonMatches(null, 'pain')).toBe(false);
  });
  it('gives no credit for copying the input line into the reason field', () => {
    for (const c of cases) {
      const g = gold(c.id);
      if (g.prn_indication === null) continue;
      expect(scoreCaseV3(g, exact(g, { prn_indication: c.input }), c.input).prn_indication, c.id).toBe(false);
    }
  });
});

describe('scorer v3: dose and units', () => {
  it('converts mass units before comparing', () => {
    expect(doseMatchesV3({ value: 1, unit: 'g' }, { value: 1000, unit: 'mg' })).toBe(true);
    expect(doseMatchesV3({ value: 400, unit: 'mcg' }, { value: 0.4, unit: 'mg' })).toBe(true);
    expect(doseMatchesV3({ value: 0.5, unit: 'g' }, { value: 400, unit: 'mg' })).toBe(false);
  });
  it('keeps units, mL and mass apart', () => {
    expect(doseMatchesV3({ value: 18, unit: 'units' }, { value: 18, unit: 'units' })).toBe(true);
    expect(doseMatchesV3({ value: 10, unit: 'mL' }, { value: 500, unit: 'mg' })).toBe(false);
    expect(doseMatchesV3({ value: 18, unit: 'IU' }, { value: 18, unit: 'units' })).toBe(false);
  });
  it('reads unit spellings, including both mu characters, and refuses the do-not-use "u"', () => {
    expect(normalizeUnitV3('μg')).toBe('mcg');
    expect(normalizeUnitV3('µg')).toBe('mcg');
    expect(normalizeUnitV3('milliliters')).toBe('mL');
    expect(normalizeUnitV3('cc')).toBe('mL');
    expect(normalizeUnitV3(' MG ')).toBe('mg');
    expect(normalizeUnitV3('u')).toBeNull();
    expect(normalizeUnitV3('IU')).toBeNull();
  });
  it('accepts plain decimal strings only', () => {
    expect(strictNumber('25')).toBe(25);
    expect(strictNumber(' 7.5 ')).toBe(7.5);
    expect(strictNumber('0x0A')).toBeNull();
    expect(strictNumber('1e1')).toBeNull();
    expect(strictNumber('10 mg')).toBeNull();
    expect(strictNumber(Infinity)).toBeNull();
  });
});

describe('scorer v3: parsing and schema', () => {
  it('finds the answer after prose that contains braces, and takes the last of several objects', () => {
    const g = gold('s01');
    expect(parsePredictionV3('Note {see below}: ' + exact(g)).how).toBe('embedded');
    expect(scoreCaseV3(g, 'Note {see below}: ' + exact(g), input('s01')).allCorrect).toBe(true);
    const twice = parsePredictionV3('{"drug":"draft"} Corrected: ' + exact(g));
    expect(twice.how).toBe('last-of-several');
    expect(scoreCaseV3(g, '{"drug":"draft"} Corrected: ' + exact(g), input('s01')).allCorrect).toBe(true);
    expect(parsePredictionV3('```json\n' + exact(g) + '\n```').how).toBe('embedded');
    expect(parsePredictionV3('{"drug":"a } b"}').value).toEqual({ drug: 'a } b' });
    expect(parsePredictionV3('no json here').how).toBe('none');
  });
  it('reports schema problems separately from correctness', () => {
    const g = gold('s01');
    expect(scoreCaseV3(g, exact(g), input('s01'), schema).schemaProblems).toEqual([]);
    const extra = scoreCaseV3(g, exact(g, { daily_max_mg: 999999 }), input('s01'), schema);
    expect(extra.allCorrect).toBe(true);
    expect(extra.schemaProblems).toEqual(['$.daily_max_mg: not in the schema']);
    const wrongType = schemaProblems({ ...JSON.parse(exact(g)), prn: 'false' }, schema);
    expect(wrongType).toContain('$.prn: expected boolean, got string');
    const badEnum = schemaProblems({ ...JSON.parse(exact(g)), frequency: 'bid' }, schema);
    expect(badEnum.some((p) => p.startsWith('$.frequency'))).toBe(true);
  });
  it('gives no credit to the real mock reply, an echo of the resolved prompt', () => {
    const prompt = readFileSync('eval/sig-extraction/prompt.txt', 'utf8').replace('{{input}}', input('s01'));
    const s = scoreCaseV3(gold('s01'), '[Mock Echo] ' + prompt, input('s01'));
    expect(s.allCorrect).toBe(false);
    expect(s.drug || s.dose || s.prn_indication).toBe(false);
  });
  it('summarizes with a schema-valid count', () => {
    const g = gold('s01');
    const scores = [scoreCaseV3(g, exact(g), input('s01'), schema), scoreCaseV3(g, exact(g, { extra: 1 }), input('s01'), schema), scoreCaseV3(g, 'nope', input('s01'), schema)];
    expect(summarizeV3(scores)).toMatchObject({ n: 3, parsed: 2, schemaValid: 1, allCorrect: 2 });
  });
});
