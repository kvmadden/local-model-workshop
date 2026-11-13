/**
 * Builds and checks the sig bench (bench/sig-bench). No model and no network.
 *
 *   npm run bench:sig            # check the items, regenerate confirm.csv, the suite file and the rules result
 *   npm run bench:sig -- --check # the same checks, and fail if a generated file is out of date
 *
 * Generated from items.jsonl, never edited by hand:
 * - confirm.csv: the sheet Kevin fills in (ambiguous lines first, then tapers)
 * - suite-six-field.json: the representable lines with six-field gold, for `npm run eval -- --suite`
 * - results/rules-proposed.json: the frozen rules parser scored against the proposed labels
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  BENCH_SIZE,
  CLARIFY_SHARE,
  DEDUPE_THRESHOLD,
  clarifyShare,
  confirmCsv,
  itemProblems,
  maxSimilarity,
  nearDuplicates,
  parseItems,
  rulesOnBench,
  sixFieldSuite,
  type TierTally,
} from '../src/eval/sigBench';

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'bench/sig-bench');
const check = process.argv.includes('--check');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

const items = parseItems(read('bench/sig-bench/items.jsonl'));
const schema = JSON.parse(read('bench/sig-bench/schema.json'));
const problems = itemProblems(items, schema);
if (items.length !== BENCH_SIZE) problems.push(`expected ${BENCH_SIZE} items, found ${items.length}`);
const share = clarifyShare(items);
if (share < CLARIFY_SHARE.min || share > CLARIFY_SHARE.max) problems.push(`clarification share ${share.toFixed(3)} is outside ${CLARIFY_SHARE.min} to ${CLARIFY_SHARE.max}`);

const dev = read('eval/sig-extraction/cases.jsonl').trim().split('\n').map((l) => JSON.parse(l) as { id: string; input: string });
const templates = (JSON.parse(read('eval/heldout/frozen.json')) as { cases: Array<{ id: string; input: string }> }).cases;
const reference = [...dev, ...templates];
const dupes = nearDuplicates(items, reference);
for (const d of dupes) problems.push(`${d.id} overlaps ${d.against} at Jaccard ${d.similarity}`);

if (problems.length) {
  console.error(`sig bench: ${problems.length} problem(s)\n${problems.join('\n')}`);
  process.exit(1);
}

const outputs: Record<string, string> = {
  'confirm.csv': confirmCsv(items),
  'suite-six-field.json': `${JSON.stringify(sixFieldSuite(items), null, 1)}\n`,
  'results/rules-proposed.json': `${JSON.stringify(rulesOnBench(items), null, 1)}\n`,
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
      console.error(`out of date: bench/sig-bench/${name}. Run npm run bench:sig`);
      stale++;
    }
  } else {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

const result = rulesOnBench(items);
const row = (name: string, t: TierTally) =>
  `${name.padEnd(6)} ${String(t.items).padStart(5)} ${`${t.sixFieldRight}/${t.representable}`.padStart(13)} ${`${t.sixFieldRightPromptReading}/${t.representable}`.padStart(15)} ${`${t.flaggedNotRepresentable}/${t.notRepresentable}`.padStart(17)} ${`${t.flaggedNeedsClarification}/${t.needsClarification}`.padStart(14)} ${`${t.flaggedRepresentable}/${t.representable}`.padStart(16)}`;
console.log(`sig bench: ${items.length} items, ${items.filter((i) => i.label.needs_clarification).length} need clarification (${(share * 100).toFixed(1)}%), all labels ${[...new Set(items.map((i) => i.label_status))].join(' and ')}`);
console.log(`near duplicates of the ${reference.length} development and template lines at Jaccard >= ${DEDUPE_THRESHOLD}: ${dupes.length} (highest ${maxSimilarity(items, reference)})`);
console.log('\nRules parser against PROPOSED labels (six fields, scorer v3)');
console.log('tier   items  six right   prompt reading   flagged, not rep.  flagged, clar.  flagged, rep.');
for (const t of ['clean', 'hard', 'all'] as const) console.log(row(t, result.tiers[t]));
if (check && stale) process.exit(1);
console.log(check ? '\ngenerated files are up to date' : '\nwrote confirm.csv, suite-six-field.json and results/rules-proposed.json');
