import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { scoreDocumentV3, failureTypeV3, reportV3, locate, goldProblems, parseEntitiesV3 } from './extractionAuditV3';
import type { AuditCase, Entity } from './extractionAudit';

const input = 'Carvedilol 12.5 mg tablets. Take half a tablet daily.';
const gold: Entity[] = [
  { task: 'drug', value: 'carvedilol', spans: [{ start: 0, end: 10 }] },
  { task: 'schedule', value: 'daily', spans: [{ start: 47, end: 52 }] },
  { task: 'dose', value: '6.25 mg', spans: [{ start: 11, end: 18 }, { start: 33, end: 37 }], derivation: { operation: 'multiply', operands: [12.5, 0.5], unit: 'mg' } },
];
const copy = () => JSON.parse(JSON.stringify(gold));

describe('audit evaluator v3', () => {
  it('scores the same evidence the same however it is serialized', () => {
    const variants = [
      (p: any[]) => { p[0].spans = [{ end: 10, start: 0 }]; },
      (p: any[]) => { p[0].spans = [{ start: 0, end: 10, text: 'Carvedilol' }]; },
      (p: any[]) => { p[2].derivation.operands = [0.5, 12.5]; },
      (p: any[]) => { p[2].spans = [p[2].spans[1], p[2].spans[0]]; },
    ];
    for (const change of variants) {
      const p = copy();
      change(p);
      const s = scoreDocumentV3(input, gold, p);
      expect(s.supported).toHaveLength(3);
      expect(s.exactEvidence).toBe(true);
    }
  });

  it('accepts quoted evidence, so no character counting is needed', () => {
    const p = [
      { task: 'drug', value: 'carvedilol', evidence: ['Carvedilol'] },
      { task: 'schedule', value: 'daily', evidence: ['daily'] },
      { task: 'dose', value: '6.25 mg', evidence: ['half', '12.5 mg'], derivation: { operation: 'multiply', operands: [0.5, 12.5], unit: 'mg' } },
    ];
    expect(scoreDocumentV3(input, gold, p)).toMatchObject({ exactFacts: true, exactEvidence: true });
    expect(locate(input, 'TAKE HALF')).toEqual([{ start: 28, end: 37 }]);
    expect(scoreDocumentV3(input, gold, [{ task: 'drug', value: 'carvedilol', evidence: ['not in the text'] }]).supported).toHaveLength(0);
  });

  it('scores a right value with wrong offsets as a found fact with unsupported evidence, not as invented plus missing', () => {
    const p = copy();
    p[0].spans = [{ start: 0, end: 9 }];
    const s = scoreDocumentV3(input, gold, p);
    expect(s.factsFound).toHaveLength(3);
    expect(s.supported).toHaveLength(2);
    expect(s.extra).toHaveLength(0);
    expect(s.missing).toHaveLength(0);
    expect(failureTypeV3(s, null)).toBe('evidence only');
  });

  it('costs a repeated fact one duplicate instead of deleting it', () => {
    const s = scoreDocumentV3(input, gold, [...copy(), copy()[0]]);
    expect(s.supported).toHaveLength(3);
    expect(s.duplicates).toHaveLength(1);
    expect(failureTypeV3(s, null)).toBe('unsupported extra');
  });

  it('treats abstention on a negated line as correct and never as an invented fact', () => {
    const negated = 'Do not take digoxin. No active medication instruction.';
    const s = scoreDocumentV3(negated, [], [{ task: 'abstention', value: 'digoxin', spans: [{ start: 12, end: 19 }] }]);
    expect(s).toMatchObject({ abstained: true, correctAbstention: true, exactFacts: true });
    expect(s.extra).toHaveLength(0);
    expect(parseEntitiesV3('{"entities":[],"no_active_instruction":true}')).toEqual([{ task: 'abstention', value: 'no active instruction' }]);
  });

  it('labels engine errors and missing doses for what they are', () => {
    expect(failureTypeV3(scoreDocumentV3(input, gold, []), 'Ollama execution failed: timed out after 60000 ms')).toBe('engine error');
    expect(failureTypeV3(scoreDocumentV3(input, gold, []), null)).toBe('missing dose');
    const reasonOnly = 'Take baclofen 9 mg PRN spasms.';
    expect(failureTypeV3(scoreDocumentV3(reasonOnly, [{ task: 'indication', value: 'spasms', spans: [{ start: 23, end: 29 }] }], []), null)).toBe('missing fact');
    const wrong = copy();
    wrong[2].value = '12.5 mg';
    expect(failureTypeV3(scoreDocumentV3(input, gold, wrong), null)).toBe('wrong dose');
  });

  it('rejects malformed entities one by one instead of crashing', () => {
    const s = scoreDocumentV3(input, gold, [null, { task: 'drug', value: 'carvedilol', spans: [null] }, { task: 'bogus', value: 'x' }, ...copy().slice(1)]);
    expect(s.malformed).toHaveLength(2);
    expect(s.factsFound).toHaveLength(3);
    expect(s.supported).toHaveLength(2);
    expect(parseEntitiesV3('not json')).toEqual([{ unreadable: true }]);
  });

  it('rejects gold whose derivation does not compute', () => {
    const bad: Entity = { ...gold[2], value: '999 mg' };
    expect(goldProblems(input, bad)).toEqual(['derivation gives 6.25, value says 999 mg']);
    expect(() => scoreDocumentV3(input, [bad], [])).toThrow(/Invalid gold/);
    for (const c of ['public', 'challenge'].flatMap((n) => JSON.parse(readFileSync(`eval/extraction-audit/${n}.json`, 'utf8'))) as AuditCase[]) {
      for (const e of c.gold) expect(goldProblems(c.input, e), `${c.id} ${e.task}:${e.value}`).toEqual([]);
    }
  });

  it('re-reads the saved partial run: most predicted facts were right and only their offsets were wrong', () => {
    const cases = ['public', 'challenge'].flatMap((n) => JSON.parse(readFileSync(`eval/extraction-audit/${n}.json`, 'utf8'))) as AuditCase[];
    const rows = JSON.parse(readFileSync('eval/extraction-audit/local-20261101-corrected/pass1-qwen3_8_27b.json', 'utf8'));
    const r = reportV3(cases, rows);
    // 23 of 42 requests were made before the run was stopped, and the gold is an unreviewed draft,
    // so these are not results. They show what the scoring rule does to the same replies.
    expect(r.measured).toBe(23);
    expect(r.expected).toBe(42);
    expect(r.all).toMatchObject({ goldFacts: 134, predictedFacts: 181, factsFound: 92, supported: 7, extra: 76, duplicates: 13, correctAbstentions: 1 });
    // c10 has all five values right and every span one character off.
    const c10 = r.documents.find((d) => d.id === 'c10') as any;
    expect([c10.factsFound.length, c10.supported.length, c10.failure]).toEqual([5, 0, 'evidence only']);
  });

  it('keeps the v3 prompt and schema free of corpus names and challenge text', () => {
    const runtime = ['eval/extraction-audit/prompt-v3.txt', 'eval/extraction-audit/schema-v3.json', 'src/eval/extractionAuditV3.ts'].map((p) => readFileSync(p, 'utf8')).join('\n');
    expect(runtime).not.toMatch(/public\.json|challenge\.json|gold\.json/);
    const challenge = JSON.parse(readFileSync('eval/extraction-audit/challenge.json', 'utf8')) as AuditCase[];
    for (const c of challenge) expect(runtime).not.toContain(c.input);
    for (const word of ['candesartan', 'rizatriptan', 'carvedilol', 'liothyronine', 'doxazosin']) expect(readFileSync('eval/extraction-audit/prompt-v3.txt', 'utf8').toLowerCase()).not.toContain(word);
    expect(readFileSync('eval/extraction-audit/prompt-v3.txt', 'utf8')).toContain('{{input}}');
  });
});
