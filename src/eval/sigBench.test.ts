/**
 * The sig bench (bench/sig-bench): the item file, the generated files, the confirmation sheet and the scorer.
 * Every label in the bench is PROPOSED, so these tests check form and scoring rules, not clinical truth.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BENCH_SIZE,
  CLARIFY_SHARE,
  SHEET_COLUMNS,
  clarifyShare,
  confirmCsv,
  itemProblems,
  jaccard,
  nearDuplicates,
  parseItems,
  rulesOnBench,
  sheetGroup,
  sixFieldSuite,
} from './sigBench';
import { scoreBenchReply, scoreSixField, sixFieldGold, sixFieldRepresentable, type BenchItem, type BenchLabel } from './sigBenchScore';

const read = (f: string) => readFileSync(f, 'utf8');
const items = parseItems(read('bench/sig-bench/items.jsonl'));
const schema = JSON.parse(read('bench/sig-bench/schema.json'));
const byId = (id: string) => items.find((i) => i.id === id) as BenchItem;
const reference = [
  ...read('eval/sig-extraction/cases.jsonl').trim().split('\n').map((l) => JSON.parse(l) as { id: string; input: string }),
  ...(JSON.parse(read('eval/heldout/frozen.json')) as { cases: Array<{ id: string; input: string }> }).cases,
];

/** A small RFC 4180 reader, enough for the sheet. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const withLabel = (item: BenchItem, change: Partial<BenchLabel>): string => JSON.stringify({ ...item.label, ...change });

describe('sig bench items', () => {
  it('has 120 well-formed items, every label proposed', () => {
    expect(items.length).toBe(BENCH_SIZE);
    expect(itemProblems(items, schema)).toEqual([]);
    expect(new Set(items.map((i) => i.label_status))).toEqual(new Set(['proposed']));
  });

  it('has about 15% of items whose right answer is to ask for clarification', () => {
    const share = clarifyShare(items);
    expect(items.filter((i) => i.label.needs_clarification).length).toBe(18);
    expect(share).toBeGreaterThanOrEqual(CLARIFY_SHARE.min);
    expect(share).toBeLessThanOrEqual(CLARIFY_SHARE.max);
  });

  it('covers the constructs the bench is for', () => {
    const count = (cat: string) => items.filter((i) => i.categories.includes(cat)).length;
    expect(items.filter((i) => i.tier === 'clean').length).toBe(34);
    expect(items.filter((i) => i.tier === 'hard').length).toBe(86);
    for (const [cat, min] of [['taper', 10], ['max_daily', 6], ['range', 6], ['route', 10], ['laterality', 5], ['duration', 6], ['as_directed', 4], ['sliding_scale', 2], ['split_tablet', 6], ['weekly_monthly', 6], ['prn', 20]] as const) {
      expect(count(cat), cat).toBeGreaterThanOrEqual(min);
    }
  });

  it('catches malformed items (the checker shown red)', () => {
    const good = byId('sb-001');
    const bad: BenchItem[] = [
      { ...good, label_status: 'ground truth' as never },
      { ...good, id: 'sb-002', tier: 'clean', label: { ...good.label, needs_clarification: true, clarification_reason: 'x' } },
      { ...good, id: 'sb-003', label: { ...good.label, frequency: 'hourly' } },
      { ...good, id: 'sb-004', tier: 'clean', label: { ...good.label, dose_high: 40 } },
    ];
    const found = itemProblems(bad, schema).join('\n');
    expect(found).toMatch(/sb-001: label_status/);
    expect(found).toMatch(/sb-002: needs clarification but is not in that category/);
    expect(found).toMatch(/sb-002: a line that needs clarification is hard/);
    expect(found).toMatch(/sb-003: \$\.frequency/);
    expect(found).toMatch(/sb-004: a clean line must fit the six fields/);
  });

  it('holds no near duplicate of a development or template line, and the check sees them', () => {
    expect(reference.length).toBe(37);
    expect(nearDuplicates(items, reference)).toEqual([]);
    const planted: BenchItem = { ...items[0], id: 'sb-999', sig: reference[0].input };
    expect(nearDuplicates([planted], reference).map((d) => d.against)).toContain(reference[0].id);
    expect(jaccard('a b c', 'a b c')).toBe(1);
    expect(jaccard('a b', 'c d')).toBe(0);
  });

  it('carries no patient identifiers: no names, dates of birth or record numbers', () => {
    const text = read('bench/sig-bench/items.jsonl');
    expect(text).not.toMatch(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
    expect(text).not.toMatch(/\b(?:DOB|MRN|date of birth|Rx\s*#|patient name|Mr\.|Mrs\.|Ms\.)/i);
  });
});

describe('sig bench generated files', () => {
  it('are up to date with items.jsonl', () => {
    expect(read('bench/sig-bench/confirm.csv')).toBe(confirmCsv(items));
    expect(read('bench/sig-bench/suite-six-field.json')).toBe(`${JSON.stringify(sixFieldSuite(items), null, 1)}\n`);
    expect(read('bench/sig-bench/results/rules-proposed.json')).toBe(`${JSON.stringify(rulesOnBench(items), null, 1)}\n`);
  });

  it('confirm.csv lists every item once, ambiguous lines first, then tapers, with an empty kevin column', () => {
    const rows = parseCsv(read('bench/sig-bench/confirm.csv'));
    expect(rows[0]).toEqual([...SHEET_COLUMNS]);
    const body = rows.slice(1);
    expect(body.length).toBe(BENCH_SIZE);
    expect(new Set(body.map((r) => r[0])).size).toBe(BENCH_SIZE);
    for (const r of body) expect(r.length).toBe(SHEET_COLUMNS.length);
    const col = (name: (typeof SHEET_COLUMNS)[number]) => SHEET_COLUMNS.indexOf(name);
    expect(body.every((r) => r[col('kevin')] === '')).toBe(true);
    expect(body.every((r) => r[col('label_status')] === 'proposed')).toBe(true);
    const groups = body.map((r) => sheetGroup(byId(r[0])));
    expect([...groups].sort((a, b) => a - b)).toEqual(groups);
    expect(body.slice(0, 18).every((r) => r[col('needs_clarification')] === 'yes')).toBe(true);
    expect(body[18][col('group')]).toBe('taper or phases');
    for (const r of body) expect(r[col('sig')]).toBe(byId(r[0]).sig);
  });

  it('use no semicolons or em dashes in what Kevin reads', () => {
    for (const f of ['bench/sig-bench/confirm.csv', 'bench/sig-bench/README.md', 'bench/sig-bench/items.jsonl']) {
      const text = read(f).replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
      expect(text.includes(';'), `${f} has a semicolon`).toBe(false);
      expect(text.includes('—'), `${f} has an em dash`).toBe(false);
    }
  });

  it('never present the proposed labels as confirmed', () => {
    const suite = JSON.parse(read('bench/sig-bench/suite-six-field.json'));
    expect(suite.status).toMatch(/PROPOSED/);
    expect(JSON.parse(read('bench/sig-bench/results/rules-proposed.json')).label_status).toMatch(/proposed/);
    const card = read('bench/sig-bench/README.md');
    expect(card).toMatch(/proposed/i);
    expect(card).not.toMatch(/ground truth(?! until)/i);
  });

  it('the data card quotes the rules numbers the result file holds', () => {
    const t = (JSON.parse(read('bench/sig-bench/results/rules-proposed.json')) as ReturnType<typeof rulesOnBench>).tiers;
    const card = read('bench/sig-bench/README.md');
    expect(card).toContain(`| Clean | ${t.clean.sixFieldRight} of ${t.clean.representable} | ${t.clean.sixFieldRightPromptReading} of ${t.clean.representable} |`);
    expect(card).toContain(`| Hard, representable | ${t.hard.sixFieldRight} of ${t.hard.representable} | ${t.hard.sixFieldRightPromptReading} of ${t.hard.representable} |`);
    expect(card).toContain(`gains ${t.clean.sixFieldRightPromptReading - t.clean.sixFieldRight} clean lines`);
    expect(card).toContain(`The ${t.all.notRepresentable} lines it cannot represent`);
    expect(card).toContain(`${t.all.flaggedNeedsClarification} of the ${t.all.needsClarification} clarification lines`);
    expect(card).toContain(`${t.clean.flaggedRepresentable} of the ${t.clean.items} clean lines`);
    expect(read('README.md')).toContain(`right on ${t.clean.sixFieldRight} of ${t.clean.items} clean lines and ${t.hard.sixFieldRight} of ${t.hard.representable} hard lines the six fields can hold, and it cannot represent the other ${t.all.notRepresentable}`);
  });

  it('the suite file holds exactly the representable lines, and the harness can read its gold units', () => {
    const suite = JSON.parse(read('bench/sig-bench/suite-six-field.json'));
    const representable = items.filter((i) => sixFieldRepresentable(i.label)).map((i) => i.id);
    expect(suite.cases.map((c: { id: string }) => c.id)).toEqual(representable);
    expect(suite.cases.length + suite.not_representable.length).toBe(BENCH_SIZE);
    expect(suite.conventions.bedtimeAsNeeded).toBe('no-schedule');
    for (const c of suite.cases) expect(['mg', 'mcg', 'g', 'units', 'mL']).toContain(c.gold.dose_per_administration.unit);
  });
});

describe('sig bench scorer', () => {
  it('gives full marks to every proposed label replayed as a reply (control)', () => {
    for (const it of items) expect(scoreBenchReply(it, JSON.stringify(it.label)).allCorrect, it.id).toBe(true);
    for (const it of items.filter((i) => sixFieldRepresentable(i.label))) {
      const g = sixFieldGold(it)!;
      expect(scoreSixField(it, JSON.stringify(g))?.allCorrect, it.id).toBe(true);
    }
  });

  it('scores a line that needs clarification only on the flag', () => {
    const it = byId('sb-036');
    expect(it.label.needs_clarification).toBe(true);
    expect(scoreBenchReply(it, JSON.stringify({ drug: 'methotrexate', needs_clarification: true })).allCorrect).toBe(true);
    expect(scoreBenchReply(it, JSON.stringify({ drug: 'methotrexate', dose_per_administration: { value: 10, unit: 'mg' }, frequency: 'once_daily', needs_clarification: false })).allCorrect).toBe(false);
    expect(scoreSixField(it, '{}')).toBeNull();
  });

  it('counts a flag on a clear line as a miss', () => {
    const it = byId('sb-001');
    expect(scoreBenchReply(it, withLabel(it, { needs_clarification: true, clarification_reason: 'unsure' })).allCorrect).toBe(false);
  });

  it('reads units, intervals and weekdays the way a pharmacist writes them', () => {
    const cap = items.find((i) => i.label.max_daily_dose?.value === 3250)!;
    expect(scoreBenchReply(cap, withLabel(cap, { max_daily_dose: { value: 3.25, unit: 'g' } })).allCorrect).toBe(true);
    expect(scoreBenchReply(cap, withLabel(cap, { max_daily_dose: { value: 3250, unit: 'mcg' } })).allCorrect).toBe(false);
    expect(scoreBenchReply(cap, withLabel(cap, { prn_interval: { min: 240, max: 240, unit: 'min' } })).allCorrect).toBe(true);
    expect(scoreBenchReply(cap, withLabel(cap, { prn_interval: { min: 4, max: 6, unit: 'h' } })).allCorrect).toBe(false);
    const mtx = items.find((i) => i.label.days_of_week?.includes('saturday'))!;
    expect(scoreBenchReply(mtx, withLabel(mtx, { days_of_week: ['Sat'] })).allCorrect).toBe(true);
    expect(scoreBenchReply(mtx, withLabel(mtx, { days_of_week: ['sunday'] })).allCorrect).toBe(false);
    const range = items.find((i) => i.label.dose_high === 1000 && i.label.dose_per_administration?.value === 500)!;
    expect(scoreBenchReply(range, withLabel(range, { dose_per_administration: { value: 0.5, unit: 'g' }, dose_high: 1 })).allCorrect).toBe(true);
    expect(scoreBenchReply(range, withLabel(range, { dose_high: 750 })).allCorrect).toBe(false);
  });

  it('keeps taper order but lets concurrent weekday phases come in any order', () => {
    const taper = items.find((i) => (i.label.phases?.length ?? 0) === 4)!;
    const reversed = [...taper.label.phases!].reverse();
    expect(scoreBenchReply(taper, withLabel(taper, { phases: reversed })).allCorrect).toBe(false);
    expect(scoreBenchReply(taper, withLabel(taper, { phases: taper.label.phases!.slice(0, 3) })).allCorrect).toBe(false);
    const weekly = items.find((i) => i.label.phases?.every((p) => p.days_of_week))!;
    expect(scoreBenchReply(weekly, withLabel(weekly, { phases: [...weekly.label.phases!].reverse() })).allCorrect).toBe(true);
  });

  it('checks every sliding-scale band', () => {
    const scale = items.find((i) => i.label.sliding_scale)!;
    const bands = scale.label.sliding_scale!;
    expect(scoreBenchReply(scale, withLabel(scale, { sliding_scale: [...bands].reverse() })).allCorrect).toBe(true);
    expect(scoreBenchReply(scale, withLabel(scale, { sliding_scale: bands.map((b, i) => (i === 1 ? { ...b, units: b.units + 1 } : b)) })).allCorrect).toBe(false);
  });

  it('accepts a listed spelling of the drug or reason, and nothing else', () => {
    const apap = items.find((i) => i.accept?.drug?.includes('APAP'))!;
    expect(scoreBenchReply(apap, withLabel(apap, { drug: 'APAP', prn_indication: 'HA' })).allCorrect).toBe(true);
    expect(scoreBenchReply(apap, withLabel(apap, { drug: 'paracetamol' })).allCorrect).toBe(false);
  });

  it('scores six-field replies under the ruling, and under the prompt reading through alt', () => {
    const it = items.find((i) => i.alt?.frequency === 'every_6_hours' && sixFieldRepresentable(i.label))!;
    const reply = JSON.stringify({ ...sixFieldGold(it), frequency: 'every_6_hours' });
    expect(scoreSixField(it, reply, 'ruling')?.allCorrect).toBe(false);
    expect(scoreSixField(it, reply, 'prompt')?.allCorrect).toBe(true);
  });

  it('takes the six-field vocabulary from the frozen schema', () => {
    const base = byId('sb-001').label;
    expect(sixFieldRepresentable({ ...base, frequency: 'once_weekly' })).toBe(true);
    expect(sixFieldRepresentable({ ...base, frequency: 'every_other_day' })).toBe(false);
    expect(sixFieldRepresentable({ ...base, dose_per_administration: { value: 1, unit: 'drop' } })).toBe(false);
  });
});
