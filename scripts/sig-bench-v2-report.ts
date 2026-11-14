/**
 * Scores every source on sig bench v2 and writes the comparison. No model and no network.
 *
 *   npm run bench:sig:v2:report            # write results/models-v2.json and the tables in RESULTS-v2.md
 *   npm run bench:sig:v2:report -- --check # fail if either is out of date
 *
 * Reads the raw replies in bench/sig-bench/results/models-v2/ (written by scripts/sig-bench-v2-run.ts)
 * and scores the frozen rules parser beside them (src/eval/sigBenchV2Report.ts). Text in
 * RESULTS-v2.md outside the generated markers is kept as written.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseItemsV2 } from '../src/eval/sigBenchV2';
import { generatedBlock, resultsJson, scoreSources, withGeneratedBlock, type RawRow } from '../src/eval/sigBenchV2Report';

const ROOT = path.resolve(__dirname, '..');
const BENCH = path.join(ROOT, 'bench/sig-bench');
const RAW = path.join(BENCH, 'results/models-v2');
const check = process.argv.includes('--check');

const items = parseItemsV2(readFileSync(path.join(BENCH, 'items-v2.jsonl'), 'utf8'));
const files = existsSync(RAW) ? readdirSync(RAW).filter((f) => f.startsWith('raw-') && f.endsWith('.jsonl')).sort() : [];
const raws = files.map((f) => readFileSync(path.join(RAW, f), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as RawRow));
const results = scoreSources(items, raws);
const block = generatedBlock(items, results);

const mdFile = path.join(BENCH, 'RESULTS-v2.md');
const jsonFile = path.join(BENCH, 'results/models-v2.json');
const md = withGeneratedBlock(readFileSync(mdFile, 'utf8'), block);
const json = resultsJson(results);
if (check) {
  let stale = 0;
  for (const [file, text] of [[mdFile, md], [jsonFile, json]] as const) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
      console.error(`out of date: ${path.relative(ROOT, file)}. Run npm run bench:sig:v2:report`);
      stale++;
    }
  }
  process.exit(stale ? 1 : 0);
}
writeFileSync(mdFile, md);
writeFileSync(jsonFile, json);
console.log(block);
console.log(`\nscored ${raws.length} model file(s) and the rules parser. wrote RESULTS-v2.md and results/models-v2.json`);
