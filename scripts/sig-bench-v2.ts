/**
 * Builds and checks sig bench v2. No model and no network.
 *
 *   npm run bench:sig:v2            # check items-v2.jsonl, regenerate confirm-v2.json and results/rules-v2.json
 *   npm run bench:sig:v2 -- --check # the same checks, and fail if a generated file is out of date
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { V2_SIZE, confirmV2, itemProblemsV2, parseItemsV2, quantityCheck, rulesV2OnBench } from '../src/eval/sigBenchV2';
import { READING_FIELDS } from '../src/eval/sigBenchV2Score';
import { parseItems } from '../src/eval/sigBench';

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'bench/sig-bench');
const check = process.argv.includes('--check');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

const items = parseItemsV2(read('bench/sig-bench/items-v2.jsonl'));
const schema = JSON.parse(read('bench/sig-bench/schema-v2.json'));
const v1 = parseItems(read('bench/sig-bench/items.jsonl'));
const review = JSON.parse(read('bench/sig-bench/review/kevin-2026-11-13.json')).labels;
const problems = itemProblemsV2(items, schema, v1, review);
if (items.length !== V2_SIZE) problems.push(`expected ${V2_SIZE} items, found ${items.length}`);
if (problems.length) {
  console.error(`sig bench v2: ${problems.length} problem(s)\n${problems.join('\n')}`);
  process.exit(1);
}

const result = rulesV2OnBench(items);
const outputs: Record<string, string> = {
  'confirm-v2.json': `${JSON.stringify(confirmV2(items), null, 1)}\n`,
  'results/rules-v2.json': `${JSON.stringify(result, null, 1)}\n`,
};
let stale = 0;
for (const [name, text] of Object.entries(outputs)) {
  const file = path.join(DIR, name);
  if (check) {
    let current = '';
    try {
      current = readFileSync(file, 'utf8');
    } catch {
      current = '';
    }
    if (current !== text) {
      console.error(`out of date: bench/sig-bench/${name}. Run npm run bench:sig:v2`);
      stale++;
    }
  } else {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

const by = (k: string) => items.filter((i) => i.label_status === k).length;
const checks = items.map(quantityCheck);
const kinds = ['exact', 'covers', 'within_max', 'skipped'].map((k) => `${k} ${checks.filter((c) => c.kind === k).length}`).join(', ');
console.log(`sig bench v2: ${items.length} items. confirmed ${by('confirmed')}, kevin-notes ${by('kevin-notes')}, proposed ${by('proposed')}. flagged ${items.filter((i) => i.label.flag.needed).length}, with a likely reading ${items.filter((i) => i.label.likely_reading).length}`);
console.log(`quantity checks: ${kinds}`);
console.log(`confirm-v2.json rows: ${(confirmV2(items) as { rows: unknown[] }).rows.length}`);
console.log('\nRules parser (v2 wrapper), both tiers');
console.log('bucket    flag right   tp fp fn tn   reading all right   reading fields right');
for (const b of ['clean', 'hard', 'reviewed', 'all'] as const) {
  const s = result.buckets[b];
  const fieldsRight = READING_FIELDS.reduce((n, f) => n + s.reading.fields[f], 0);
  console.log(
    `${b.padEnd(9)} ${`${s.flag.correct}/${s.flag.items}`.padStart(10)}   ${[s.flag.truePositive, s.flag.falsePositive, s.flag.falseNegative, s.flag.trueNegative].join(' ')}   ${`${s.reading.allCorrect}/${s.reading.items}`.padStart(17)}   ${fieldsRight}/${s.reading.items * READING_FIELDS.length}`,
  );
}
if (check && stale) process.exit(1);
console.log(check ? '\ngenerated files are up to date' : '\nwrote confirm-v2.json and results/rules-v2.json');
