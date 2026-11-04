import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  anchorKind,
  applyOverrides,
  criticalGatePasses,
  differingAnswers,
  goldOf,
  headlineMarkdown,
  latencyGate,
  lineStatus,
  peakMemory,
  readings,
  scoreLine,
  scoreModel,
  scoreReplies,
  tally,
  writtenDrug,
  type FinalLabel,
  type LineStatus,
  type MemorySample,
  type ReplyRow,
  type SixField,
} from './freshBlind';

// Every line, drug and label below is made up for these tests. None comes from the blind set.
const schema = JSON.parse(readFileSync('eval/sig-extraction/schema.json', 'utf8'));

const sf = (over: Partial<SixField> = {}): SixField => ({ drug: 'alphamine', dose_per_administration: { value: 10, unit: 'mg' }, frequency: 'twice_daily', timing: null, prn: false, prn_indication: null, ...over });
const label = (id: string, over: Partial<FinalLabel> = {}): FinalLabel => ({
  id,
  six_field: sf(),
  six_field_representable: true,
  contested: false,
  critical_fields: [{ med: 0, fields: ['drug', 'dose', 'schedule', 'route', 'as_needed'] }],
  categories: ['1'],
  meds: [{ drug_text: 'alphamine', ingredient: 'alphamine', schedule: { anchors: [] } }],
  alt: null,
  ...over,
});
const reply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ drug: 'alphamine', dose_per_administration: { value: 10, unit: 'mg' }, frequency: 'twice_daily', timing: null, prn: false, prn_indication: null, ...over });
const row = (id: string, output: string, over: Partial<ReplyRow> = {}): ReplyRow => ({ id, input: `line ${id}`, output, error: null, latencyMs: 3000, wallMs: 3000, position: 1, ...over });

describe('line status', () => {
  const bedtimeC1 = label('b', { contested: true, contested_convention: 'C1', meds: [{ schedule: { anchors: [{ when: 'bedtime' }] } }] });
  const morningC1 = label('m', { contested: true, contested_convention: 'C1', meds: [{ schedule: { anchors: [{ when: 'morning' }] } }] });
  const c2 = label('c', { contested: true, contested_convention: 'C2' });

  it('sorts lines into the gate, the contested set and the lines the six fields cannot hold', () => {
    expect(lineStatus(label('a'))).toBe('gate');
    expect(lineStatus(label('n', { six_field_representable: false, six_field: null }))).toBe('not_representable');
    expect(lineStatus(c2)).toBe('contested');
  });

  it("settles a bedtime C1 line by Kevin's ruling, and keeps a morning C1 line contested until he extends it", () => {
    expect(anchorKind(bedtimeC1)).toBe('bedtime');
    expect(lineStatus(bedtimeC1)).toBe('gate');
    expect(lineStatus(morningC1)).toBe('contested');
    expect(lineStatus(morningC1, { c1_other_anchors: 'contested' })).toBe('contested');
    expect(lineStatus(morningC1, { c1_other_anchors: 'gate' })).toBe('gate');
    expect(lineStatus(c2, { c1_other_anchors: 'gate' })).toBe('contested'); // C2 has no pending ruling
  });
});

describe('overrides', () => {
  it('replaces the gold of a changed line, and refuses a line that is not in the set or a representable line with no gold', () => {
    const labels = [label('a'), label('b')];
    const out = applyOverrides(labels, { lines: { a: { six_field: sf({ drug: 'betamine' }) } }, reviewed: ['a', 'b'] });
    expect(out[0].six_field?.drug).toBe('betamine');
    expect(out[1]).toBe(labels[1]);
    expect(() => applyOverrides(labels, { reviewed: ['zzz'] })).toThrow();
    expect(() => applyOverrides(labels, { lines: { a: { six_field: null } } })).toThrow();
    expect(applyOverrides(labels, { lines: { a: { six_field: null, six_field_representable: false } } })[0].six_field_representable).toBe(false);
    // A contested line's other reading can be replaced too.
    const c = label('c', { contested: true, contested_convention: 'C2', alt: { six_field: sf({ timing: null }) } });
    expect(applyOverrides([c], { lines: { c: { alt: { six_field: sf({ timing: 'with_meals' }) } } } })[0].alt?.six_field?.timing).toBe('with_meals');
  });
});

describe('the drug as written', () => {
  it('is returned only when the line writes the drug without the ingredient', () => {
    expect(writtenDrug(label('a'))).toBeNull();
    expect(writtenDrug(label('a', { six_field: sf({ drug: 'atorvastatin' }), meds: [{ drug_text: 'Lipitor', ingredient: 'atorvastatin' }] }))).toBe('lipitor');
    expect(writtenDrug(label('a', { six_field: sf({ drug: 'metoprolol tartrate' }), meds: [{ drug_text: 'metoprolol tartrate', ingredient: 'metoprolol tartrate' }] }))).toBeNull();
  });
});

describe('scoreLine', () => {
  const l = label('a');

  it('passes a right reply', () => {
    const s = scoreLine(l, reply(), 'line a', schema);
    expect(s.allCorrect).toBe(true);
    expect(s.criticalWrong).toEqual([]);
    expect(s.routeNotCheckable).toBe(true); // route is marked critical and cannot be checked
  });

  it('counts a wrong dose, frequency, drug or as-needed status as a critical error, and a wrong timing as a miss only', () => {
    expect(scoreLine(l, reply({ dose_per_administration: { value: 20, unit: 'mg' } }), 'line a', schema).criticalWrong).toEqual(['dose']);
    expect(scoreLine(l, reply({ frequency: 'once_daily' }), 'line a', schema).criticalWrong).toEqual(['schedule']);
    expect(scoreLine(l, reply({ drug: 'gammamine' }), 'line a', schema).criticalWrong).toEqual(['drug']);
    expect(scoreLine(l, reply({ prn: true }), 'line a', schema).criticalWrong).toEqual(['as_needed']);
    const timing = scoreLine(l, reply({ timing: 'bedtime' }), 'line a', schema);
    expect(timing.allCorrect).toBe(false);
    expect(timing.criticalWrong).toEqual([]);
  });

  it('only counts the fields the label marks as critical', () => {
    const onlyDrug = label('d', { critical_fields: [{ med: 0, fields: ['drug'] }] });
    expect(scoreLine(onlyDrug, reply({ dose_per_administration: { value: 99, unit: 'mg' } }), 'line d', schema).criticalWrong).toEqual([]);
  });

  it('counts a reply that cannot be read as a critical error', () => {
    const s = scoreLine(l, 'I cannot help with that', 'line a', schema);
    expect(s.parsed).toBe(false);
    expect(s.criticalWrong).toEqual(['unparsed']);
  });

  it('accepts the drug as written or the ingredient, and reports the ingredient-only reading too', () => {
    const brand = label('e', { six_field: sf({ drug: 'atorvastatin' }), meds: [{ drug_text: 'Lipitor', ingredient: 'atorvastatin' }] });
    const asWritten = scoreLine(brand, reply({ drug: 'Lipitor' }), 'Lipitor 10 mg twice daily', schema);
    expect(asWritten.allCorrect).toBe(true);
    expect(asWritten.allCorrectIngredientOnly).toBe(false);
    expect(asWritten.criticalWrong).toEqual([]);
    const ingredient = scoreLine(brand, reply({ drug: 'atorvastatin' }), 'Lipitor 10 mg twice daily', schema);
    expect(ingredient.allCorrect && ingredient.allCorrectIngredientOnly).toBe(true);
  });

  it('scores a contested line against its other reading', () => {
    const c = label('c', { contested: true, contested_convention: 'C1', six_field: sf({ frequency: null, timing: 'morning', prn: true, prn_indication: 'pain' }), alt: { six_field: sf({ frequency: 'once_daily', timing: 'morning', prn: true, prn_indication: 'pain' }) } });
    const asNeeded = reply({ frequency: null, timing: 'morning', prn: true, prn_indication: 'pain' });
    expect(scoreLine(c, asNeeded, 'x', schema, 'primary').allCorrect).toBe(true);
    expect(scoreLine(c, asNeeded, 'x', schema, 'alt').allCorrect).toBe(false);
    expect(goldOf(c, 'alt')?.frequency).toBe('once_daily');
  });
});

describe('scoreReplies', () => {
  const contested = label('c', { contested: true, contested_convention: 'C2', categories: ['2'], six_field: sf({ timing: 'with_meals' }), alt: { six_field: sf({ timing: null }) } });
  const labels = [label('a', { categories: ['1', '2'] }), label('b', { categories: ['1'] }), contested, label('n', { six_field_representable: false, six_field: null })];
  const statuses = new Map<string, LineStatus>(labels.map((x) => [x.id, lineStatus(x)]));

  it('tallies the gate lines, the contested lines both ways and the lines the six fields cannot hold', () => {
    const rows = [row('a', reply()), row('b', reply({ dose_per_administration: { value: 1, unit: 'mg' } })), row('c', reply({ timing: 'with_meals' })), row('n', reply())];
    const s = scoreReplies(labels, statuses, rows, schema);
    expect([s.gate, s.contested, s.notRepresentable]).toEqual([2, 1, 1]);
    expect(s.allCorrect).toMatchObject({ k: 1, n: 2 });
    expect(s.critical).toMatchObject({ k: 1, n: 2 });
    expect(s.criticalByField).toEqual({ dose: 1 });
    expect(s.perField.drug).toBe(2);
    expect(s.contestedPrimary).toMatchObject({ k: 1, n: 1 });
    expect(s.contestedAlt).toMatchObject({ k: 0, n: 1 });
    expect(s.notRepresentableParsed).toBe(1);
    expect(s.categories['1']).toMatchObject({ k: 1, n: 2 });
    expect(s.categories['2']).toMatchObject({ k: 1, n: 1 });
    expect(s.routeNotCheckable).toBe(2);
  });

  it('refuses to score when a line has no reply or two replies share an id', () => {
    expect(() => scoreReplies(labels, statuses, [row('a', reply())], schema)).toThrow(/no reply/);
    expect(() => scoreReplies(labels, statuses, [row('a', reply()), row('a', reply())], schema)).toThrow(/share/);
  });
});

describe('the gates', () => {
  it('needs zero critical errors over a gate of about 227 lines, and cannot be passed with a small gate', () => {
    expect(criticalGatePasses(tally(0, 227))).toBe(true);
    expect(criticalGatePasses(tally(1, 227))).toBe(false);
    expect(criticalGatePasses(tally(0, 10))).toBe(false);
    expect(criticalGatePasses(tally(0, 0))).toBe(false);
  });

  it('counts every timed request against the latency budget, failures included', () => {
    const fast = Array.from({ length: 455 }, (_, i) => row(`x${i}`, reply(), { latencyMs: 4000, position: i + 1 }));
    expect(latencyGate(fast).pass).toBe(true);
    // 5 percent of the requests over ten seconds is exactly the edge. 6 percent is over it.
    const slow = (n: number) => fast.map((r, i) => (i < n ? { ...r, latencyMs: 12000 } : r));
    expect(latencyGate(slow(22)).pass).toBe(true);
    expect(latencyGate(slow(25)).pass).toBe(false);
    // A failed request counts at the time it took, with no latency recorded.
    expect(latencyGate(fast.map((r, i) => (i < 40 ? { ...r, latencyMs: null, wallMs: 60000, error: 'timeout' } : r))).pass).toBe(false);
    expect(latencyGate(fast.slice(0, 100)).pass).toBe(false);
    expect(latencyGate(fast.slice(0, 100)).why).toMatch(/300/);
  });
});

describe('differing answers', () => {
  it('counts lines whose parsed answer changed between the passes', () => {
    const a = [row('a', reply()), row('b', reply()), row('c', 'nonsense')];
    const b = [row('a', reply()), row('b', reply({ frequency: 'once_daily' })), row('c', 'other nonsense')];
    expect(differingAnswers(a, b)).toEqual({ lines: 3, differ: 1 });
    // Key order and white space do not matter.
    expect(differingAnswers([row('a', reply())], [row('a', JSON.stringify(JSON.parse(reply()), null, 2))])).toEqual({ lines: 1, differ: 0 });
  });
});

describe('peak memory', () => {
  const proc = (rssKb: number, cmd = '/home/someone/.local/ollama/llama runner') => ({ pid: 1, rss_kb: rssKb, cmd });
  const models = ['m1', 'm2'];
  const samples: MemorySample[] = [
    { t: 1, load1: 40, procs: [proc(1024 * 1000), proc(1024 * 10, '/usr/bin/agy --note ollama')], resident: [{ name: 'm1', size: 1048576 * 800 }] },
    { t: 2, load1: 60, procs: [proc(1024 * 1500)], resident: [{ name: 'm1', size: 1048576 * 900 }, { name: 'other', size: 1 }] },
    { t: 3, load1: 50, procs: [proc(1024 * 3000)], resident: [{ name: 'm1' }, { name: 'm2' }] },
    { t: 4, load1: 20, procs: [proc(1024 * 2000)], resident: [{ name: 'm2', size: 1048576 * 1900 }] },
    { t: 5, load1: 5, procs: [], resident: { error: 'down' } },
  ];

  it('attributes the resident memory of the Ollama processes to the one test model that is loaded', () => {
    const out = peakMemory(samples, models);
    expect(out.m1.peakRssMb).toBe(1500);
    expect(out.m1.peakLoadedSizeMb).toBe(900);
    expect(out.m1.loadRange).toEqual([40, 60]);
    expect(out.m1.samples).toBe(2);
    expect(out.m1.otherModelSamples).toBe(1);
    expect(out.m2.peakRssMb).toBe(2000);
  });

  it('leaves out samples where two test models were loaded at once, and counts them', () => {
    const out = peakMemory(samples, models);
    expect(out.m1.overlapSamples).toBe(1);
    expect(out.m2.overlapSamples).toBe(1);
  });

  it('does not count a process that is not an Ollama process', () => {
    expect(peakMemory(samples, models).m1.peakRssMb).not.toBe(1000 + 10);
  });
});

describe('readings and models', () => {
  it('gives the reading over all lines and the reading without the disclosed line', () => {
    const labels = [label('w-0001'), label('w-0193'), label('w-0002')];
    const r = readings(labels);
    expect(r.map((x) => x.labels.length)).toEqual([3, 2]);
    expect(r[1].name).toContain('without w-0193');
    expect(r[1].labels.some((l) => l.id === 'w-0193')).toBe(false);
  });

  it('passes a model on a gate only when both passes pass it, and drops the disclosed line from the second reading', () => {
    // 227 gate lines and 228 lines the six fields cannot hold, as in the real set. Every one of the 455 is a timed request.
    const id = (i: number) => `w-${String(i + 1).padStart(4, '0')}`;
    const labels = Array.from({ length: 455 }, (_, i) => (i < 227 ? label(id(i)) : label(id(i), { six_field_representable: false, six_field: null })));
    const statuses = new Map<string, LineStatus>(labels.map((x) => [x.id, lineStatus(x)]));
    const good = labels.map((l, i) => row(l.id, reply(), { position: i + 1 }));
    const bad = good.map((r, i) => (i === 0 ? { ...r, output: reply({ drug: 'wrongmine' }) } : r));
    const both = scoreModel({ model: 'm', passes: [good, good] }, labels, statuses, schema, null);
    expect(both.gates).toEqual({ critical: true, latency: true, eligible: true });
    expect(both.differingAnswers).toEqual({ lines: 455, differ: 0 });
    // One critical error in 227 lines puts the upper bound of the interval above 2 percent.
    const oneBad = scoreModel({ model: 'm', passes: [good, bad] }, labels, statuses, schema, null);
    expect(oneBad.passes.map((p) => p.criticalGate)).toEqual([true, false]);
    expect(oneBad.gates.eligible).toBe(false);
    expect(oneBad.differingAnswers?.differ).toBe(1);
    // The wrong reply is on the first line. Dropping that line from the reading makes the second pass pass.
    const without = labels.slice(1);
    expect(scoreModel({ model: 'm', passes: [good, bad] }, without, new Map(without.map((x) => [x.id, lineStatus(x)])), schema, null).gates.critical).toBe(true);
  });

  it('writes a headline table with every model and baseline', () => {
    const labels = Array.from({ length: 320 }, (_, i) => label(`w-${String(i + 1).padStart(4, '0')}`));
    const statuses = new Map<string, LineStatus>(labels.map((x) => [x.id, 'gate']));
    const rows = labels.map((l, i) => row(l.id, reply(), { position: i + 1 }));
    const m = scoreModel({ model: 'gpt-oss:20b', passes: [rows, rows] }, labels, statuses, schema, null);
    const md = headlineMarkdown('all 320 lines', { 'gpt-oss:20b': m }, { rules: scoreReplies(labels, statuses, rows, schema) });
    expect(md).toContain('| gpt-oss:20b |');
    expect(md).toContain('| baseline: rules |');
    expect(md).toContain('320/320');
  });
});
