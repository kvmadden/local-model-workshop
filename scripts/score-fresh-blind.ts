/**
 * Scores the fresh blind set from the saved replies of both passes. Run once, after the scoring code is frozen in
 * lock.json and Kevin's answers are recorded (eval/fresh-blind-set/RUN-PLAN.md). Nothing is sent to a model.
 *
 *   npx vite-node scripts/score-fresh-blind.ts -- --set <staged set folder> --runs <folder with pass1 and pass2> \
 *     --out <new folder> [--overrides <json>] [--sampler <jsonl>] [--review-json <json>]
 *
 * It checks the staged files, the scorer files and every reply's input line against lock.json and the staged
 * lines before it scores anything, and it never overwrites a folder. The output holds line ids, categories and
 * counts, never the text of a line or a reply.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runBaseline, BASELINES } from '../src/eval/sigBaselines';
import { assertNewOutputDir } from '../src/eval/harness';
import {
  applyOverrides,
  headlineMarkdown,
  formatTally,
  lineStatus,
  peakMemory,
  readings,
  scoreModel,
  scoreReplies,
  scoreLine,
  type FinalLabel,
  type LineStatus,
  type MemorySample,
  type Overrides,
  type ReplyRow,
} from '../src/eval/freshBlind';

const ROOT = path.resolve(__dirname, '..');
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const fail = (msg: string): never => {
  console.error(msg);
  process.exit(2);
};
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const readJsonl = <T>(file: string): T[] => readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as T);
const slug = (model: string) => model.replace(/[^a-zA-Z0-9.-]+/g, '_');

const setDir = path.resolve(arg('--set') ?? fail('missing --set'));
const runsDir = path.resolve(arg('--runs') ?? fail('missing --runs'));
const outDir = path.resolve(arg('--out') ?? fail('missing --out'));
const lock = JSON.parse(readFileSync(path.resolve(arg('--lock') ?? path.join(ROOT, 'eval/fresh-blind-set/lock.json')), 'utf8'));
try {
  assertNewOutputDir(outDir);
} catch (err) {
  fail((err as Error).message);
}

// ─── Check everything against the registration ─────────────────────────────────

for (const f of ['labels-adjudicated.jsonl', 'lines.jsonl', 'convention-sheet.md']) {
  if (sha256(readFileSync(path.join(setDir, f))) !== lock.files[f]) fail(`${f} does not match the registered hash. Not scoring.`);
}
const reviewJsonPath = arg('--review-json');
if (reviewJsonPath && sha256(readFileSync(reviewJsonPath)) !== lock.added_after_lock['review/kevin-critical-fields.json']) fail('the review list does not match the registered hash. Not scoring.');
for (const f of ['src/eval/sigScoreV3.ts', 'src/eval/sigScore.ts', 'src/eval/sigBaselines.ts', 'eval/sig-extraction/schema.json', 'eval/sig-extraction/models.json', 'eval/sig-extraction/prompt.txt']) {
  if (sha256(readFileSync(path.join(ROOT, f))) !== lock.pinned_code.files[f]) fail(`${f} differs from the registered pinned file. Not scoring.`);
}

const schema = JSON.parse(readFileSync(path.join(ROOT, 'eval/sig-extraction/schema.json'), 'utf8'));
const models: string[] = JSON.parse(readFileSync(path.join(ROOT, 'eval/sig-extraction/models.json'), 'utf8')).models.map((m: { model: string }) => m.model);
const lines = new Map(readJsonl<{ id: string; text: string }>(path.join(setDir, 'lines.jsonl')).map((l) => [l.id, l.text]));
const overrides: Overrides = arg('--overrides') ? JSON.parse(readFileSync(path.resolve(arg('--overrides')!), 'utf8')) : {};
const labels = applyOverrides(readJsonl<FinalLabel>(path.join(setDir, 'labels-adjudicated.jsonl')), overrides);
if (labels.length !== lines.size) fail('the labels and the lines do not have the same number of entries');

// ─── Load the replies ──────────────────────────────────────────────────────────

const passes = [1, 2].map((p) => {
  const dir = path.join(runsDir, `pass${p}`);
  const summary = JSON.parse(readFileSync(path.join(dir, 'summary.json'), 'utf8'));
  if (summary.complete !== true) fail(`pass ${p} is marked incomplete. Finish it with a labeled supplementary pass first.`);
  if (summary.changedDuringRun?.length) fail(`pass ${p} reports files that changed during the run`);
  return { dir, summary };
});
const rowsOf = (pass: number, model: string): ReplyRow[] => {
  const rows = readJsonl<ReplyRow>(path.join(passes[pass - 1].dir, `raw-${slug(model)}.jsonl`));
  for (const r of rows) if (lines.get(r.id) !== r.input) fail(`the input of ${r.id} in pass ${pass} (${model}) is not the staged line. Not scoring.`);
  if (rows.length !== lines.size) fail(`pass ${pass} (${model}) has ${rows.length} replies, not ${lines.size}`);
  return rows;
};

const statusesFor = (ls: FinalLabel[]) => new Map<string, LineStatus>(ls.map((l) => [l.id, lineStatus(l, overrides.decisions)]));
const samples = arg('--sampler') ? readJsonl<MemorySample>(path.resolve(arg('--sampler')!)) : [];
const memory = samples.length ? peakMemory(samples, models) : null;

const disputed: string[] = reviewJsonPath ? JSON.parse(readFileSync(reviewJsonPath, 'utf8')).disputed.map((i: { id: string }) => i.id) : [];
const reviewed = new Set(overrides.reviewed ?? []);

// ─── Score ─────────────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });
const report: Record<string, unknown> = {};
const md: string[] = ['# Fresh blind set results', '', 'Scored once, from the saved replies of both passes, with the frozen scorer. The latency gate was measured under load, not on a quiet machine.', ''];
const misses: string[] = [];
for (const reading of readings(labels)) {
  const statuses = statusesFor(reading.labels);
  const counts = { gate: 0, contested: 0, not_representable: 0 };
  for (const s of statuses.values()) counts[s] += 1;
  const modelReports = Object.fromEntries(models.map((m) => [m, scoreModel({ model: m, passes: [rowsOf(1, m), rowsOf(2, m)] }, reading.labels, statuses, schema, memory?.[m] ?? null)]));
  const baselineReports = Object.fromEntries(
    BASELINES.map((b) => {
      const rows: ReplyRow[] = reading.labels.map((l, i) => ({ id: l.id, input: lines.get(l.id)!, output: runBaseline(b, lines.get(l.id)!, { bedtimeAsNeeded: 'no-schedule' }).text, error: null, latencyMs: null, wallMs: null, position: i + 1 }));
      return [b, scoreReplies(reading.labels, statuses, rows, schema)];
    }),
  );
  report[reading.name] = { counts, disputed: { total: disputed.length, reviewed: disputed.filter((i) => reviewed.has(i)).length, unreviewed: disputed.filter((i) => !reviewed.has(i)).length }, models: modelReports, baselines: baselineReports };

  md.push(headlineMarkdown(reading.name, modelReports, baselineReports));
  md.push(`Lines: ${counts.gate} in the gate, ${counts.contested} contested, ${counts.not_representable} the six fields cannot hold. Disputed lines reviewed: ${disputed.filter((i) => reviewed.has(i)).length} of ${disputed.length}.`, '');
  md.push('| Model | Pass | Contested lines, primary reading | Contested lines, other reading | Lines the six fields cannot hold, reply read | Ingredient-only drug reading, all six fields right |', '|---|---|---|---|---|---|');
  for (const [m, r] of Object.entries(modelReports)) r.passes.forEach((p, i) => md.push(`| ${m} | ${i + 1} | ${formatTally(p.score.contestedPrimary)} | ${formatTally(p.score.contestedAlt)} | ${p.score.notRepresentableParsed} of ${p.score.notRepresentable} | ${formatTally(p.score.allCorrectIngredientOnly)} |`));
  md.push('');
  const cats = Object.keys(modelReports[models[0]].passes[0].score.categories);
  md.push('| Category (gate lines) | ' + models.flatMap((m) => [`${m} pass 1`, `${m} pass 2`]).join(' | ') + ' | rules baseline |', '|---|' + '---|'.repeat(models.length * 2 + 1));
  for (const c of cats) md.push(`| ${c} | ${models.flatMap((m) => modelReports[m].passes.map((p) => formatTally(p.score.categories[c]))).join(' | ')} | ${formatTally(baselineReports.rules.categories[c])} |`);
  md.push('');

  // Every miss on a gate line, with its category: ids and field names only.
  if (reading.labels.length === labels.length) {
    for (const m of models) {
      for (let p = 1; p <= 2; p++) {
        const byId = new Map(rowsOf(p, m).map((r) => [r.id, r]));
        for (const l of reading.labels) {
          if (statuses.get(l.id) !== 'gate') continue;
          const s = scoreLine(l, byId.get(l.id)!.output, lines.get(l.id)!, schema);
          if (!s.allCorrect) misses.push(JSON.stringify({ model: m, pass: p, id: l.id, categories: l.categories.map(String), wrongFields: (Object.keys(s.fields) as Array<keyof typeof s.fields>).filter((f) => !s.fields[f]), criticalWrong: s.criticalWrong }));
        }
      }
    }
  }
}

const meta = {
  scored_local: new Date().toISOString(),
  lock_registration_merge_commit: lock.inference?.registration_merge_commit ?? null,
  overrides_sha256: arg('--overrides') ? sha256(readFileSync(path.resolve(arg('--overrides')!))) : null,
  sampler_sha256: arg('--sampler') ? sha256(readFileSync(path.resolve(arg('--sampler')!))) : null,
  raw_files_sha256: Object.fromEntries([1, 2].flatMap((p) => models.map((m) => [`pass${p}/raw-${slug(m)}.jsonl`, sha256(readFileSync(path.join(passes[p - 1].dir, `raw-${slug(m)}.jsonl`)))]))),
  scorer_files_sha256: Object.fromEntries(['src/eval/freshBlind.ts', 'scripts/score-fresh-blind.ts'].map((f) => [f, sha256(readFileSync(path.join(ROOT, f)))])),
};
writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ meta, report }, null, 1) + '\n', { flag: 'wx' });
writeFileSync(path.join(outDir, 'results.md'), md.join('\n') + '\n', { flag: 'wx' });
writeFileSync(path.join(outDir, 'misses.jsonl'), misses.join('\n') + (misses.length ? '\n' : ''), { flag: 'wx' });
console.log(`scored ${labels.length} lines for ${models.length} models in 2 passes under ${Object.keys(report).length} readings. Wrote results.json, results.md and misses.jsonl.`);
