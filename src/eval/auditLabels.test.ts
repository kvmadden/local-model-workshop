/**
 * Labels v2 of the public label excerpts: v1 plus exactly the 19 accepted corrections. v1 stays
 * byte for byte as evidence. Every number here is development data on draft labels.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyLabelChanges, pythonStyleJson, type LabelChangeSet } from './auditLabels';
import { goldProblems, reportV3 } from './extractionAuditV3';
import { scoreEntities, validEntity, normalize, type AuditCase } from './extractionAudit';
import { parseOutput } from '../../scripts/audit-report';

const read = (p: string) => readFileSync(p, 'utf8');
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const set = JSON.parse(read('eval/extraction-audit/public-v2-changes.json')) as LabelChangeSet;
const v1Text = read('eval/extraction-audit/public.json');
const v2Text = read('eval/extraction-audit/public-v2.json');
const v1 = JSON.parse(v1Text) as AuditCase[];
const v2 = JSON.parse(v2Text) as AuditCase[];
const challenge = JSON.parse(read('eval/extraction-audit/challenge.json')) as AuditCase[];

describe('labels v2 of the public label excerpts', () => {
  it('leaves labels v1 byte for byte, at the hash the frozen protocol locks', () => {
    const frozen = JSON.parse(read('eval/extraction-audit/versions/v1/frozen-input-hashes.json'));
    expect(sha256(v1Text)).toBe(set.base.sha256);
    expect(JSON.stringify(frozen)).toContain(set.base.sha256);
  });

  it('is labels v1 with the 19 accepted changes applied, byte for byte, at the recorded hash', () => {
    expect(set.changes.map((c) => c.n)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
    // The rows of docs/KEVIN-REVIEW.md section 3, in order.
    expect(set.changes.map((c) => c.id)).toEqual(['p01', 'p03', 'p05', 'p05', 'p06', 'p07', 'p10', 'p11', 'p14', 'p16', 'p17', 'p18', 'p19', 'p20', 'p21', 'p25', 'p28', 'p29', 'p30']);
    expect(pythonStyleJson(applyLabelChanges(v1, set))).toBe(v2Text);
    expect(sha256(v2Text)).toBe(set.result.sha256);
    expect(set.result.sha256).toBe('6942d6e0c4f449fe006984243e9292b244327ffa04b0e47cca49435da46a8a1d');
  });

  it('changes only the gold and the correction note of the 18 cases named, and nothing else', () => {
    const named = new Set(set.changes.map((c) => c.id));
    expect(v2.map((c) => c.id)).toEqual(v1.map((c) => c.id));
    for (const [i, before] of v1.entries()) {
      const after = v2[i];
      if (!named.has(before.id)) {
        expect(after, before.id).toEqual(before);
        continue;
      }
      const { gold: g1, review: r1, ...rest1 } = before;
      const { gold: g2, review: r2, ...rest2 } = after;
      expect(rest2, before.id).toEqual(rest1);
      expect({ ...r2, correction: null }, before.id).toEqual({ ...r1, correction: null });
      expect(r2.status, before.id).toBe('draft');
      expect(r2.correction, before.id).toMatch(/Proposed by Claude\. Accepted by Kevin Madden, PharmD, as part of a batch of 19\. Not yet checked one by one by a pharmacist\.$/);
      expect(g2, before.id).not.toEqual(g1);
    }
    expect(named.size).toBe(18);
  });

  it('holds gold that both evaluators accept: valid spans, literal text, no repeated task and value', () => {
    for (const c of v2) {
      const identities = c.gold.map((e) => `${e.task}:${normalize(e.value)}`);
      expect(new Set(identities).size, c.id).toBe(identities.length);
      for (const e of c.gold) {
        expect(goldProblems(c.input, e), `${c.id} ${e.task}:${e.value}`).toEqual([]);
        expect(validEntity(c.input, e), `${c.id} ${e.task}:${e.value}`).toBe(true);
      }
    }
    // Every added entity is the literal text at its span.
    for (const change of set.changes) {
      const c = v2.find((x) => x.id === change.id)!;
      for (const add of change.add) {
        const e = c.gold.find((x) => x.task === add.task && x.value === normalize(add.text))!;
        expect(c.input.slice(e.spans[0].start, e.spans[0].end), `${c.id} ${add.text}`).toBe(add.text);
      }
    }
  });

  it('records p10 as a conditional repeat dose, not as-needed use', () => {
    const p10 = v2.find((c) => c.id === 'p10')!;
    expect(p10.gold.some((e) => e.task === 'prn')).toBe(false);
    expect(p10.review.correction).toContain('A conditional repeat dose, not as-needed use.');
  });

  it('rescores the saved partial run on both label versions, as development data', () => {
    const rows = JSON.parse(read('eval/extraction-audit/local-20261101-corrected/pass1-qwen3_8_27b.json')) as { id: string; output: string; error: string | null; latencyMs: number | null }[];
    const v3 = (pub: AuditCase[]) => reportV3([...pub, ...challenge], rows);
    const frozenV2 = (pub: AuditCase[]) => [...pub, ...challenge].filter((c) => rows.some((r) => r.id === c.id)).reduce((t, c) => {
      const s = scoreEntities(c.input, c.gold, parseOutput(rows.find((r) => r.id === c.id)!.output));
      return { supported: t.supported + s.supported.length, predicted: t.predicted + s.supported.length + s.unsupported.length, gold: t.gold + s.supported.length + s.missing.length };
    }, { supported: 0, predicted: 0, gold: 0 });

    // 23 of 42 requests were made before the run was stopped.
    expect(v3(v1).measured).toBe(23);
    // Evaluator v3, all measured lines.
    expect(v3(v1).all).toMatchObject({ goldFacts: 134, factsFound: 92, supported: 7, extra: 76, exactFacts: 4 });
    expect(v3(v2).all).toMatchObject({ goldFacts: 129, factsFound: 99, supported: 8, extra: 69, exactFacts: 5 });
    // Evaluator v3, the 18 measured public excerpts (development and final splits).
    const publicOnly = (r: ReturnType<typeof v3>) => ({ goldFacts: r.bySplit.dev.goldFacts + r.bySplit.final.goldFacts, factsFound: r.bySplit.dev.factsFound + r.bySplit.final.factsFound, supported: r.bySplit.dev.supported + r.bySplit.final.supported });
    expect(publicOnly(v3(v1))).toEqual({ goldFacts: 119, factsFound: 78, supported: 1 });
    expect(publicOnly(v3(v2))).toEqual({ goldFacts: 114, factsFound: 85, supported: 2 });
    // The challenge lines did not change, so neither did their score.
    expect(v3(v2).bySplit.challenge).toEqual(v3(v1).bySplit.challenge);
    // The frozen evaluator v2, which needs exact character offsets.
    expect(frozenV2(v1)).toEqual({ supported: 6, predicted: 182, gold: 134 });
    expect(frozenV2(v2)).toEqual({ supported: 7, predicted: 182, gold: 129 });
  });
});
