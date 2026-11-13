/**
 * Sig bench v2: the items, Kevin's review carried into them, the generated files, the confirmation
 * sheet, and the two-tier scorer. 22 labels are confirmed, 27 come from Kevin's notes and 71 are
 * proposed, so these tests check form, provenance and scoring rules, not clinical truth.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { V2_SIZE, confirmV2, itemProblemsV2, needsKevin, parseItemsV2, quantityCheck, rulesV2OnBench, schemaProblemsV2 } from './sigBenchV2';
import { READING_FIELDS, addScore, emptySummary, scoreV2Reply, type V2Item, type V2Label, type V2Reading } from './sigBenchV2Score';
import { rulesV2 } from './sigBaselinesV2';
import { parseItems } from './sigBench';

const read = (f: string) => readFileSync(f, 'utf8');
const items = parseItemsV2(read('bench/sig-bench/items-v2.jsonl'));
const schema = JSON.parse(read('bench/sig-bench/schema-v2.json'));
const v1 = parseItems(read('bench/sig-bench/items.jsonl'));
const review = JSON.parse(read('bench/sig-bench/review/kevin-2026-11-13.json')).labels as Record<string, { v: string; note?: string }>;
const byId = (id: string) => items.find((i) => i.id === id) as V2Item;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const reading = (id: string) => byId(id).label.likely_reading as V2Reading;
/** Kevin's gold label for an item, with a change to its likely reading, as a reply. */
const withReading = (id: string, change: Partial<V2Reading>, flag?: Partial<V2Label['flag']>): string => {
  const l = clone(byId(id).label);
  return JSON.stringify({ ...l, flag: { ...l.flag, ...flag }, likely_reading: { ...l.likely_reading, ...change } });
};
const problemsWith = (id: string, edit: (it: V2Item) => void): string[] => {
  const changed = items.map((i) => (i.id === id ? clone(i) : i));
  edit(changed.find((i) => i.id === id) as V2Item);
  return itemProblemsV2(changed, schema, v1, review).filter((p) => p.startsWith(id));
};

describe('sig bench v2 items', () => {
  it('has the 120 v1 lines, well formed, with the label status the review gives', () => {
    expect(items.length).toBe(V2_SIZE);
    expect(itemProblemsV2(items, schema, v1, review)).toEqual([]);
    const count = (s: string) => items.filter((i) => i.label_status === s).length;
    expect([count('confirmed'), count('kevin-notes'), count('proposed')]).toEqual([22, 27, 71]);
    expect(Object.keys(review).length).toBe(49);
    for (const it of items) expect(it.source_line).toBe(v1.find((o) => o.id === it.id)!.sig);
  });

  it('flags every line Kevin held, and no line he marked correct', () => {
    for (const it of items) {
      if (it.review.verdict === 'hold') expect(it.label.flag.needed, it.id).toBe(true);
      if (it.review.verdict === 'ok') expect(it.label.flag.needed, it.id).toBe(false);
    }
    expect(items.filter((i) => i.label.flag.needed).length).toBe(27);
  });

  it('catches malformed items (the checker shown red)', () => {
    expect(problemsWith('sb-035', (i) => (i.label.flag.needed = false)).join('\n')).toMatch(/Should be flagged/);
    expect(problemsWith('sb-053', (i) => (i.label.flag = { needed: true, reasons: ['missing_frequency'] })).join('\n')).toMatch(/marked the unflagged label correct/);
    expect(problemsWith('sb-001', (i) => (i.input.quantity.value = 31)).join('\n')).toMatch(/does not fit the reading/);
    expect(problemsWith('sb-001', (i) => (i.label.likely_reading!.basis = [{ kind: 'drug_norm', text: 'x', source: 'kevin_note' }])).join('\n')).toMatch(/he wrote none/);
    expect(problemsWith('sb-063', (i) => (i.label.likely_reading!.dose = { min: 5, max: 5, unit: 'mg' })).join('\n')).toMatch(/weekly schedule/);
    expect(problemsWith('sb-001', (i) => (i.label.likely_reading!.route = 'by mouth')).join('\n')).toMatch(/not an allowed value/);
    expect(problemsWith('sb-001', (i) => (i.review.note = 'invented')).join('\n')).toMatch(/saved review/);
    expect(problemsWith('sb-001', (i) => (i.label_status = 'confirmed')).join('\n')).toMatch(/label_status/);
    expect(problemsWith('sb-047', (i) => (i.label.likely_reading!.frequency = 'twice_daily')).join('\n')).toMatch(/frequency_range/);
    expect(schemaProblemsV2({ flag: { needed: true, reasons: ['made_up'] }, likely_reading: null, safety_notes: [] }, schema, schema)).toEqual(['$.flag.reasons[0]: "made_up" is not an allowed value']);
  });

  it('checks quantity and days supply by arithmetic on most items, and says which it cannot', () => {
    const checks = items.map(quantityCheck);
    expect(checks.every((c) => c.ok)).toBe(true);
    const computed = checks.filter((c) => c.kind !== 'skipped').length;
    expect(computed).toBeGreaterThanOrEqual(95);
    expect(quantityCheck(byId('sb-063'))).toMatchObject({ kind: 'exact', need: 24 });
    expect(quantityCheck(byId('sb-058'))).toMatchObject({ kind: 'exact', need: 53 });
    expect(quantityCheck(byId('sb-089'))).toMatchObject({ kind: 'covers', need: 4 });
    expect(quantityCheck(byId('sb-049'))).toMatchObject({ kind: 'within_max', need: 40 });
    expect(quantityCheck(byId('sb-080')).kind).toBe('skipped');
  });

  it('marks the quantity role on every flagged line, and the arithmetic with it', () => {
    for (const it of items) {
      if (it.quantity_role !== 'consistent') expect(it.label.flag.needed && it.quantity_math !== null, it.id).toBe(true);
    }
    expect(items.filter((i) => i.quantity_role === 'supports_one_reading').map((i) => i.id)).toEqual(['sb-035', 'sb-037', 'sb-039', 'sb-041', 'sb-049', 'sb-052']);
  });

  it('records a source for every basis, and cites Kevin only where he wrote a note', () => {
    for (const it of items) {
      for (const b of it.label.likely_reading?.basis ?? []) {
        expect(['sig_text', 'input_fields', 'kevin_note', 'pharmacy_knowledge']).toContain(b.source);
        if (b.source === 'kevin_note') expect(it.review.note, it.id).not.toBeNull();
      }
    }
  });

  it('carries no patient identifiers', () => {
    const text = read('bench/sig-bench/items-v2.jsonl');
    expect(text).not.toMatch(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
    expect(text).not.toMatch(/\b(?:DOB|MRN|date of birth|Rx\s*#|patient name|Mr\.|Mrs\.|Ms\.)/i);
  });
});

describe("Kevin's notes, as v2 holds them", () => {
  it('reads metoprolol tartrate qd bid as likely twice daily, and lisinopril ud as once daily by division', () => {
    expect(reading('sb-035')).toMatchObject({ frequency: 'twice_daily', confidence: 'high' });
    expect(reading('sb-037').frequency).toBe('once_daily');
    expect(reading('sb-037').basis.map((b) => b.kind)).toContain('quantity_days');
  });

  it('reads digoxin 125 mg as 125 mcg, furosemide qd or bid as 1 to 2 times a day, and the otic line as the affected ear', () => {
    expect(reading('sb-046').dose).toEqual({ min: 125, max: 125, unit: 'mcg' });
    expect(reading('sb-046').basis[0].kind).toBe('unit_error');
    expect(reading('sb-047')).toMatchObject({ frequency: null, frequency_range: { min: 1, max: 2, per: 'day' } });
    expect(reading('sb-044').laterality).toBe('affected');
  });

  it('holds weekday doses as a weekly pattern, never as steps', () => {
    for (const id of ['sb-063', 'sb-064']) {
      expect(reading(id).phases, id).toBeNull();
      expect(reading(id).weekly_schedule?.length, id).toBe(2);
    }
    expect(reading('sb-063').weekly_schedule![1]).toEqual({ days: ['tuesday', 'friday'], dose: { min: 2.5, max: 2.5, unit: 'mg' }, quantity: { min: 0.5, max: 0.5, unit: 'tab' } });
  });

  it('holds variable doses as ranges, with the quantity per dose and a concentration for the syrup', () => {
    expect(reading('sb-073')).toMatchObject({ dose: { min: 0.25, max: 0.5, unit: 'mg' }, quantity: { min: 0.5, max: 1, unit: 'tab' } });
    expect(reading('sb-078')).toMatchObject({ dose: { min: 500, max: 1000, unit: 'mg' }, quantity: { min: 1, max: 2, unit: 'tab' } });
    expect(reading('sb-076')).toMatchObject({ dose: { min: 200, max: 400, unit: 'mg' }, quantity: { min: 10, max: 20, unit: 'mL' }, concentration: { amount: { value: 100, unit: 'mg' }, per: { value: 5, unit: 'mL' } } });
  });

  it('holds the nitroglycerin limit, the thin layer, the eye drop package question and the sumatriptan conflict', () => {
    expect(reading('sb-079').limits.max_doses_in_window).toEqual({ count: 3, window: { value: 15, unit: 'min' } });
    expect(reading('sb-083').application_amount).toEqual({ qualifier: 'thin_layer', length: null });
    expect(byId('sb-080').label.flag.reasons).toEqual(['package_unspecified']);
    expect(reading('sb-080').dosage_form).toBe('solution');
    expect(byId('sb-067').label.flag.reasons).toEqual(['internal_conflict']);
    expect(reading('sb-067').limits).toMatchObject({ max_repeats: 1, max_daily_dose: { value: 200, unit: 'mg' } });
  });

  it('keeps safety notes apart from the reading', () => {
    const codes = (id: string) => byId(id).label.safety_notes.map((n) => n.code);
    expect(codes('sb-049')).toEqual(['max_daily_cap_missing']);
    expect(reading('sb-049').limits.max_daily_dose).toEqual({ value: 4000, unit: 'mg' });
    expect(codes('sb-039')).toEqual(['basal_with_correction_dosing']);
    expect(codes('sb-043')).toEqual(['laterality_without_frequency']);
    expect(reading('sb-043')).toMatchObject({ laterality: 'right', frequency: null });
  });
});

describe('sig bench v2 generated files', () => {
  it('are up to date with items-v2.jsonl', () => {
    expect(read('bench/sig-bench/confirm-v2.json')).toBe(`${JSON.stringify(confirmV2(items), null, 1)}\n`);
    expect(read('bench/sig-bench/results/rules-v2.json')).toBe(`${JSON.stringify(rulesV2OnBench(items), null, 1)}\n`);
  });

  it('confirm-v2.json lists only what Kevin still needs to see, held lines with a likely reading first', () => {
    const sheet = JSON.parse(read('bench/sig-bench/confirm-v2.json')) as { counts: { rows: number }; rows: Array<{ id: string; group: string; label_status: string; what_changed: string; kevin: string }> };
    const ids = sheet.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(items.filter(needsKevin).map((i) => i.id).sort());
    expect(sheet.rows.length).toBe(sheet.counts.rows);
    expect(sheet.rows.filter((r) => r.label_status === 'proposed').length).toBe(71);
    for (const it of items) if (it.label_status !== 'proposed' && it.open_questions.length === 0) expect(ids, it.id).not.toContain(it.id);
    const order = ['held, with a likely reading', 'held, no likely reading', 'marked correct, one new field', 'not reviewed yet'];
    const groups = sheet.rows.map((r) => order.indexOf(r.group));
    expect([...groups].sort((a, b) => a - b)).toEqual(groups);
    expect(sheet.rows[0].group).toBe('held, with a likely reading');
    for (const r of sheet.rows) {
      expect(r.what_changed.length, r.id).toBeGreaterThan(0);
      expect(r.kevin).toBe('');
    }
  });

  it('use no semicolons or em dashes in what Kevin reads', () => {
    for (const f of ['bench/sig-bench/confirm-v2.json', 'bench/sig-bench/README.md', 'bench/sig-bench/items-v2.jsonl']) {
      const text = read(f).replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
      expect(text.includes(';'), `${f} has a semicolon`).toBe(false);
      expect(text.includes('—'), `${f} has an em dash`).toBe(false);
    }
  });

  it('leaves the frozen parser and scorer v3 byte for byte as the fresh blind lock pinned them', () => {
    const lock = JSON.parse(read('eval/fresh-blind-set/lock.json'));
    for (const f of ['src/eval/sigBaselines.ts', 'src/eval/sigScoreV3.ts', 'src/eval/sigScore.ts']) {
      expect(createHash('sha256').update(readFileSync(f)).digest('hex'), f).toBe(lock.pinned_code.files[f]);
    }
  });

  it('the data card quotes the rules numbers the result file holds', () => {
    const b = (JSON.parse(read('bench/sig-bench/results/rules-v2.json')) as ReturnType<typeof rulesV2OnBench>).buckets;
    const card = read('bench/sig-bench/README.md');
    const fieldsRight = (k: keyof typeof b) => READING_FIELDS.reduce((n, f) => n + b[k].reading.fields[f], 0);
    for (const [name, k] of [['Clean', 'clean'], ['Hard', 'hard'], ['Reviewed by Kevin', 'reviewed'], ['All', 'all']] as const) {
      const s = b[k];
      expect(card).toContain(`| ${name} | ${s.flag.correct} of ${s.flag.items} | ${s.flag.truePositive} of ${s.flag.truePositive + s.flag.falseNegative} | ${s.flag.falsePositive} of ${s.flag.falsePositive + s.flag.trueNegative} | ${s.reading.allCorrect} of ${s.reading.items} | ${fieldsRight(k)} of ${s.reading.items * READING_FIELDS.length} |`);
    }
    const f = b.all.reading.fields;
    expect(card).toContain(`dose ${f.dose}, quantity ${f.quantity}, frequency ${f.frequency} and route ${f.route}`);
    expect(card).toContain(`on the ${b.all.reading.items} items whose label has one`);
    expect(card).toContain(`by arithmetic on ${items.map(quantityCheck).filter((c) => c.kind !== 'skipped').length} of the 120 items`);
    const reviewedRows = items.filter((i) => i.label_status !== 'proposed' && needsKevin(i)).length;
    expect(card).toContain(`the 71 unreviewed lines and ${reviewedRows} reviewed lines where v2 adds something new`);
  });
});

describe('sig bench v2 scorer', () => {
  it('gives full marks on both tiers to every gold label replayed as a reply (control)', () => {
    for (const it of items) {
      const s = scoreV2Reply(it, JSON.stringify(it.label));
      expect(s.flag.correct, it.id).toBe(true);
      expect(s.flag.reasonsNamed, it.id).toBe(s.flag.reasonsExpected);
      expect(s.safety.named, it.id).toBe(s.safety.expected);
      if (it.label.likely_reading) expect(s.reading?.allCorrect, `${it.id} ${READING_FIELDS.filter((f) => !s.reading!.fields[f])}`).toBe(true);
      else expect(s.reading).toBeNull();
    }
  });

  it('scores the flag right and the likely reading wrong, separately', () => {
    const s = scoreV2Reply(byId('sb-035'), withReading('sb-035', { frequency: 'once_daily' }));
    expect(s.flag.correct).toBe(true);
    expect(s.reading?.allCorrect).toBe(false);
    expect(s.reading?.fields.frequency).toBe(false);
    expect(READING_FIELDS.filter((f) => !s.reading!.fields[f])).toEqual(['frequency']);
  });

  it('scores the flag wrong and the likely reading right, separately', () => {
    const s = scoreV2Reply(byId('sb-035'), withReading('sb-035', {}, { needed: false, reasons: [] }));
    expect(s.flag.correct).toBe(false);
    expect(s.reading?.allCorrect).toBe(true);
    const clear = scoreV2Reply(byId('sb-001'), withReading('sb-001', {}, { needed: true, reasons: ['missing_frequency'] }));
    expect([clear.flag.correct, clear.reading?.allCorrect]).toEqual([false, true]);
  });

  it('does not score a reading where the label has none, and reports one offered anyway', () => {
    const it = byId('sb-036');
    expect(scoreV2Reply(it, JSON.stringify(it.label)).reading).toBeNull();
    const guessed = scoreV2Reply(it, JSON.stringify({ ...it.label, likely_reading: reading('sb-035') }));
    expect([guessed.flag.correct, guessed.reading, guessed.readingOfferedWithoutGold]).toEqual([true, null, true]);
  });

  it('counts a missing likely reading as a miss on every field', () => {
    const s = scoreV2Reply(byId('sb-035'), JSON.stringify({ ...byId('sb-035').label, likely_reading: null }));
    expect(s.flag.correct).toBe(true);
    expect(s.reading).toMatchObject({ offered: false, allCorrect: false });
    expect(READING_FIELDS.some((f) => s.reading!.fields[f])).toBe(false);
  });

  it('holds a dose range as a range, and converts mass units', () => {
    const fixed = scoreV2Reply(byId('sb-073'), withReading('sb-073', { dose: { min: 0.5, max: 0.5, unit: 'mg' } }));
    expect(fixed.reading?.fields.dose).toBe(false);
    const topWrong = scoreV2Reply(byId('sb-073'), withReading('sb-073', { dose: { min: 0.25, max: 1, unit: 'mg' }, quantity: { min: 0.5, max: 2, unit: 'tab' } }));
    expect([topWrong.reading?.fields.dose, topWrong.reading?.fields.quantity]).toEqual([false, false]);
    const mcg = scoreV2Reply(byId('sb-073'), withReading('sb-073', { dose: { min: 250, max: 500, unit: 'mcg' } }));
    expect(mcg.reading?.fields.dose).toBe(true);
    const qty = scoreV2Reply(byId('sb-078'), withReading('sb-078', { quantity: { min: 1, max: 2, unit: 'tablets' } }));
    expect(qty.reading?.fields.quantity).toBe(true);
  });

  it('matches a concentration however it is written, and not a wrong one', () => {
    const asMgPerMl = scoreV2Reply(byId('sb-080'), withReading('sb-080', { concentration: { amount: { value: 5, unit: 'mg' }, per: { value: 1, unit: 'mL' }, percent: null } }));
    expect(asMgPerMl.reading?.fields.concentration).toBe(true);
    const perOneMl = scoreV2Reply(byId('sb-076'), withReading('sb-076', { concentration: { amount: { value: 20, unit: 'mg' }, per: { value: 1, unit: 'mL' }, percent: null } }));
    expect(perOneMl.reading?.fields.concentration).toBe(true);
    const wrong = scoreV2Reply(byId('sb-076'), withReading('sb-076', { concentration: { amount: { value: 100, unit: 'mg' }, per: { value: 1, unit: 'mL' }, percent: null } }));
    expect(wrong.reading?.fields.concentration).toBe(false);
  });

  it('scores a weekday pattern in any order, and a weekday pattern written as steps as wrong', () => {
    const r = reading('sb-063');
    const reordered = scoreV2Reply(byId('sb-063'), withReading('sb-063', { weekly_schedule: [...r.weekly_schedule!].reverse() }));
    expect(reordered.reading?.allCorrect).toBe(true);
    const asSteps = scoreV2Reply(byId('sb-063'), withReading('sb-063', {
      weekly_schedule: null,
      phases: r.weekly_schedule!.map((e) => ({ dose: e.dose, quantity: e.quantity, frequency: 'once_daily', timing: null, days: null })),
    }));
    expect([asSteps.reading?.fields.weekly, asSteps.reading?.fields.phases]).toEqual([false, false]);
    const wrongDose = scoreV2Reply(byId('sb-063'), withReading('sb-063', { weekly_schedule: [r.weekly_schedule![0], { ...r.weekly_schedule![1], dose: { min: 5, max: 5, unit: 'mg' } }] }));
    expect(wrongDose.reading?.fields.weekly).toBe(false);
    const wrongDay = scoreV2Reply(byId('sb-063'), withReading('sb-063', { weekly_schedule: [r.weekly_schedule![0], { ...r.weekly_schedule![1], days: ['tuesday', 'thursday'] }] }));
    expect(wrongDay.reading?.fields.weekly).toBe(false);
    const mondays = scoreV2Reply(byId('sb-100'), withReading('sb-100', { days_of_week: null, weekly_schedule: [{ days: ['mon'], dose: { min: 15, max: 15, unit: 'mg' }, quantity: null }] }));
    expect(mondays.reading?.fields.weekly).toBe(true);
  });

  it('compares a dose window in either time unit', () => {
    const hours = scoreV2Reply(byId('sb-079'), withReading('sb-079', { limits: { ...reading('sb-079').limits, max_doses_in_window: { count: 3, window: { value: 0.25, unit: 'h' } } } }));
    expect(hours.reading?.fields.max_doses_in_window).toBe(true);
    const missing = scoreV2Reply(byId('sb-079'), withReading('sb-079', { limits: { ...reading('sb-079').limits, max_doses_in_window: null } }));
    expect(missing.reading?.fields.max_doses_in_window).toBe(false);
  });

  it('counts reasons a reply can name, and leaves the reviewer hold out of reason recall', () => {
    expect(scoreV2Reply(byId('sb-063'), JSON.stringify(byId('sb-063').label)).flag.reasonsExpected).toBe(0);
    const half = scoreV2Reply(byId('sb-037'), JSON.stringify({ ...byId('sb-037').label, flag: { needed: true, reasons: ['missing_frequency'] } }));
    expect([half.flag.reasonsExpected, half.flag.reasonsNamed]).toEqual([2, 1]);
  });

  it('gives an unreadable reply nothing on either tier', () => {
    const s = scoreV2Reply(byId('sb-035'), 'I would call the prescriber.');
    expect(s).toMatchObject({ parsed: false, flag: { reply: null, correct: false }, reading: { offered: false, allCorrect: false } });
  });

  it('tallies the flag confusion matrix and the reading fields', () => {
    const sum = emptySummary();
    addScore(sum, scoreV2Reply(byId('sb-035'), withReading('sb-035', { frequency: 'once_daily' })));
    addScore(sum, scoreV2Reply(byId('sb-001'), withReading('sb-001', {}, { needed: true, reasons: ['missing_frequency'] })));
    addScore(sum, scoreV2Reply(byId('sb-036'), JSON.stringify({ flag: { needed: false, reasons: [] }, likely_reading: null, safety_notes: [] })));
    expect(sum.flag).toMatchObject({ items: 3, correct: 1, truePositive: 1, falsePositive: 1, falseNegative: 1, trueNegative: 0 });
    expect(sum.reading).toMatchObject({ items: 2, offered: 2, allCorrect: 1 });
    expect(sum.reading.fields.frequency).toBe(1);
  });
});

describe('rules parser in the v2 shape', () => {
  it('emits a schema-valid v2 reply for every item, and flags only by plain patterns', () => {
    for (const it of items) expect(schemaProblemsV2(rulesV2(it.input), schema, schema), it.id).toEqual([]);
    expect(rulesV2(byId('sb-035').input).flag.reasons).toContain('conflicting_frequency');
    expect(rulesV2(byId('sb-050').input).flag.reasons).toEqual(['missing_drug', 'missing_strength']);
    expect(rulesV2(byId('sb-046').input).flag.needed).toBe(false);
  });
});
