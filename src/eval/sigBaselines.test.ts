import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rulesSig, runBaseline, BASELINES } from './sigBaselines';
import { scoreCaseV3, summarizeV3 } from './sigScoreV3';
import type { SigGold } from './sigScore';

const readJsonl = (f: string) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const dev = readJsonl('eval/sig-extraction/cases.jsonl') as { id: string; input: string }[];
const devGold = readJsonl('eval/sig-extraction/gold.jsonl') as SigGold[];
const templates = JSON.parse(readFileSync('eval/heldout/frozen.json', 'utf8')).cases as { id: string; input: string; v2: SigGold }[];

const score = (name: (typeof BASELINES)[number], items: { id: string; input: string }[], goldOf: (id: string) => SigGold) =>
  summarizeV3(items.map((c) => scoreCaseV3(goldOf(c.id), runBaseline(name, c.input).text, c.input)));

describe('baselines on the development sets', () => {
  // These sets are development data. The rules parser was written after reading them, so a perfect
  // score here measures how regular the sets are. It is published next to the model rows.
  it('rules parser: every field right on all 25 development lines and all 12 template lines', () => {
    expect(score('rules', dev, (id) => devGold.find((g) => g.id === id)!).allCorrect).toBe(25);
    expect(score('rules', templates, (id) => templates.find((c) => c.id === id)!.v2).allCorrect).toBe(12);
  });
  it('constant answer: the per-field floor the published per-field table should be read against', () => {
    const s = score('constant', dev, (id) => devGold.find((g) => g.id === id)!);
    expect(s).toMatchObject({ allCorrect: 0, drug: 0, dose: 0, frequency: 11, timing: 18, prn: 18, prn_indication: 18 });
  });
  it('copy control: copying the line earns no drug or reason credit under scorer v3', () => {
    const s = score('copy', dev, (id) => devGold.find((g) => g.id === id)!);
    expect(s.drug).toBe(0);
    expect(s.prn_indication).toBe(0);
    expect(s.allCorrect).toBe(0);
  });
});

describe('rules parser reads the whole line, and says what it could not read', () => {
  it('flags the development lines whose instructions do not fit the six fields', () => {
    const flagged = Object.fromEntries(dev.map((c) => [c.id, rulesSig(c.input).unread]).filter(([, u]) => (u as string[]).length > 0));
    expect(flagged).toEqual({
      s04: ['10', 'days'],
      s05: ['empty', 'stomach'],
      s10: ['x', '5', 'days'],
      s12: ['mondays'],
      s13: ['x', '7d'],
      s19: ['max', '10', 'day'],
    });
  });
  it('does not treat what it could not read as absent', () => {
    const taper = rulesSig('Prednisone 10 mg tablet - take 4 tabs PO daily x3 days, then 3 tabs daily x3 days, then stop.');
    expect(taper.unread.length).toBeGreaterThan(0);
    expect(taper.unread).toContain('then');
    const hold = rulesSig('Lisinopril 20 mg: HOLD if SBP < 100. Decrease to 10 mg PO daily.');
    expect(hold.unread).toEqual(expect.arrayContaining(['hold', 'sbp', 'decrease']));
  });
  it('reads every one of the 12 template lines completely', () => {
    for (const c of templates) expect(rulesSig(c.input).unread, c.id).toEqual([]);
  });
});

// Review round 2 (3 Nov), Grok 16. The parser is a baseline for sets written later, so it must not
// fail on them for reasons that have nothing to do with reading the instruction.
describe('rules parser: review round 2', () => {
  it('keeps a digit that is part of a drug name', () => {
    expect(rulesSig('Vitamin D3 1000 units by mouth once daily').prediction.drug).toBe('Vitamin D3');
    expect(rulesSig('Vitamin B12 1000 mcg tablet, take 1 tablet by mouth once daily').prediction.drug).toBe('Vitamin B12');
  });

  it('does not take a schedule from a negated phrase, and reports the negation as unread', () => {
    const r = rulesSig('Metformin 500 mg tablet, take 1 tablet by mouth once daily, do not take qid');
    expect(r.prediction.frequency).toBe('once_daily');
    expect(r.unread).toEqual(expect.arrayContaining(['not', 'qid']));
  });

  it('can follow either rule for "at bedtime as needed"', () => {
    const s25 = dev.find((c) => c.id === 's25')!.input;
    expect(rulesSig(s25).prediction.frequency).toBe('once_daily');
    expect(rulesSig(s25, { bedtimeAsNeeded: 'no-schedule' }).prediction.frequency).toBeNull();
    // A scheduled bedtime dose keeps its schedule under both rules.
    const s11 = dev.find((c) => c.id === 's11')!.input;
    expect(rulesSig(s11, { bedtimeAsNeeded: 'no-schedule' }).prediction.frequency).toBe('once_daily');
  });

  it('still reproduces every committed baseline reply exactly', () => {
    for (const dir of ['2026-11-03-baselines-dev25', '2026-11-03-baselines-templates12']) {
      for (const name of BASELINES) {
        const rows = readJsonl(`eval/results/${dir}/raw-baseline_${name}.jsonl`) as { id: string; input: string; output: string; unread?: string[] }[];
        for (const row of rows) {
          const again = runBaseline(name, row.input);
          expect(again.text, `${dir} ${name} ${row.id}`).toBe(row.output);
          if (name === 'rules') expect(again.unread, `${dir} ${row.id}`).toEqual(row.unread);
        }
      }
    }
  });
});
