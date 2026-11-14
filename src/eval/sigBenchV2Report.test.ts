import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseItemsV2 } from './sigBenchV2';
import { generatedBlock, modelReplySchema, resultsJson, scoreSources, withGeneratedBlock, type RawRow } from './sigBenchV2Report';

const read = (p: string) => readFileSync(p, 'utf8');
const items = parseItemsV2(read('bench/sig-bench/items-v2.jsonl'));
const RAW = 'bench/sig-bench/results/models-v2';
const raws: RawRow[][] = (existsSync(RAW) ? readdirSync(RAW).filter((f) => f.startsWith('raw-') && f.endsWith('.jsonl')).sort() : []).map((f) =>
  read(path.join(RAW, f)).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as RawRow),
);

type S = Record<string, unknown>;
const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** Does a value fit the model-facing schema: type, enum, anyOf, properties, required, additionalProperties, items. */
function fits(v: unknown, s: S): boolean {
  if (Array.isArray(s.anyOf)) return (s.anyOf as S[]).some((b) => fits(v, b));
  if (s.type !== undefined) {
    const allowed = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
    if (!allowed.includes(typeOf(v))) return false;
    if (v === null) return true;
  }
  if (Array.isArray(s.enum) && !s.enum.includes(v)) return false;
  if (s.properties && v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as S;
    const props = s.properties as Record<string, S>;
    if (((s.required as string[]) ?? []).some((k) => !(k in o))) return false;
    if (s.additionalProperties === false && Object.keys(o).some((k) => !(k in props))) return false;
    if (Object.entries(props).some(([k, sub]) => k in o && !fits(o[k], sub))) return false;
  }
  if (s.items && Array.isArray(v)) return v.every((x) => fits(x, s.items as S));
  return true;
}

describe('sig bench v2 model comparison', () => {
  const results = scoreSources(items, raws);

  it('the committed tables and result file match the raw replies', () => {
    const md = read('bench/sig-bench/RESULTS-v2.md');
    expect(md).toBe(withGeneratedBlock(md, generatedBlock(items, results)));
    expect(read('bench/sig-bench/results/models-v2.json')).toBe(resultsJson(results));
  });

  it('scores the reviewed and proposed lines apart and never pools them', () => {
    const reviewed = items.filter((i) => i.label_status !== 'proposed').length;
    for (const r of results) {
      expect(r.subsets.reviewed.extra.of).toBe(reviewed);
      expect(r.subsets.proposed.extra.of).toBe(items.length - reviewed);
      expect(r.subsets.reviewed.lines.every((l) => items.find((i) => i.id === l.id)!.label_status !== 'proposed')).toBe(true);
      expect(r.subsets.proposed.lines.every((l) => items.find((i) => i.id === l.id)!.label_status === 'proposed')).toBe(true);
    }
    expect(generatedBlock(items, results)).toContain('**Provisional. Nobody has reviewed these labels.**');
  });

  it('a reply that timed out is scored as no reply, even if text came back', () => {
    const it0 = items.find((i) => i.label.flag.needed)!;
    const right = JSON.stringify({ ...it0.label, clarify: it0.label.clarify ?? null });
    const [r] = scoreSources(items, [[{ id: it0.id, label_status: it0.label_status, source: 'ollama:x', output: right, error: 'timed out', wallMs: 1, load1m: 1 }]]).slice(1);
    const sub = it0.label_status === 'proposed' ? 'proposed' : 'reviewed';
    expect(r.subsets[sub].extra.parseFailures).toBe(1);
    expect(r.subsets[sub].summary.flag.correct).toBe(0);
  });

  it('the decoding schema can express every label, so the constraint never rules out the right answer', () => {
    const schema = modelReplySchema(JSON.parse(read('bench/sig-bench/schema-v2.json')));
    expect(JSON.stringify(schema)).not.toContain('$ref');
    expect(Object.keys(schema.properties as S)).toEqual(['flag', 'clarify', 'likely_reading', 'safety_notes']);
    for (const i of items) expect(fits({ ...i.label, clarify: i.label.clarify ?? null }, schema), i.id).toBe(true);
    // Control: the checker rejects a reply the schema forbids.
    expect(fits({ ...items[0].label, clarify: null, flag: { needed: 'no', reasons: [] } }, schema)).toBe(false);
    expect(fits({ ...items[0].label, clarify: { tier: 'maybe', rule_ids: [] } }, schema)).toBe(false);
  });

  it('use no semicolons or em dashes in what Kevin reads', () => {
    const text = read('bench/sig-bench/RESULTS-v2.md').replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
    expect(text.includes(';')).toBe(false);
    expect(text.includes('—')).toBe(false);
  });
});
