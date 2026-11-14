/**
 * Builds the fresh held-out set for Rx Intake Check, before the system exists. Prints counts only,
 * so the session that builds the system never reads a held-out line before the one scoring run.
 *
 *   npm run rx:heldout -- generate   # a separate claude -p session writes the lines and labels
 *   npm run rx:heldout -- verify     # checks every cited fact against DailyMed and RxNorm
 *   npm run rx:heldout -- check      # a second model family checks every label
 *   npm run rx:heldout -- lock       # hashes the set and its evidence into heldout/LOCK.json
 *
 * The labels follow bench/rx-intake/LABEL-CONVENTIONS.md. Drugs in the sig bench and in the
 * development set are excluded.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { assertSubscription, claudePrint, jsonFrom } from '../src/rx/claudeCli';
import { clinicalDrugs, deaSchedule, dosageSection, ingredientsOf, quoteFound } from '../src/rx/nlm';

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'bench/rx-intake');
const HO = path.join(DIR, 'heldout');
mkdirSync(HO, { recursive: true });
const SET = path.join(HO, 'heldout.jsonl');
const VERIFY = path.join(HO, 'verification.json');
const CHECK = path.join(HO, 'check-second-family.json');
const read = (p: string) => readFileSync(p, 'utf8');
const stage = process.argv.filter((a) => a !== '--')[2];

type Json = Record<string, any>;
const loadSet = (): Json[] => read(SET).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

function excludedDrugs(): string[] {
  const names = new Set<string>();
  for (const f of ['bench/sig-bench/items-v2.jsonl', 'bench/rx-intake/dev/dev-set.jsonl']) {
    for (const line of read(path.join(ROOT, f)).split('\n').filter((l) => l.trim())) {
      const it = JSON.parse(line);
      const d = it.label?.likely_reading?.drug ?? it.input?.drug_description;
      if (d) names.add(String(d).toLowerCase());
      if (it.input?.drug_description) names.add(String(it.input.drug_description).toLowerCase());
    }
  }
  return [...names].sort();
}

const GEN_SYSTEM = 'You are a pharmacist building a held-out test set for an e-prescription verification tool. You write realistic US outpatient e-prescriptions and label each one exactly by the label conventions you are given. Reply with one JSON array and nothing else.';

const REQUIRED = [
  'missing_drug', 'missing_strength', 'missing_dose', 'missing_frequency', 'missing_laterality', 'missing_taper_steps',
  'missing_titration_plan', 'missing_sliding_scale', 'as_directed_without_instructions', 'conflicting_frequency',
  'conflicting_duration', 'alternatives_without_rule', 'implausible_dose_unit', 'exceeds_usual_max',
  'frequency_product_mismatch', 'missing_max_daily', 'error_prone_abbreviation',
];
const JUDGMENT = ['package_unspecified', 'package_unspecified', 'dosage_form_unspecified (drug not controlled)', 'dosage_form_unspecified (drug not controlled)', 'internal_conflict', 'internal_conflict'];
const NEAR_MISS = [
  'a dose range such as 1 to 2 tablets', 'an interval range such as every 4 to 6 hours', 'a weekday pattern', 'a written taper with every step',
  '"as directed" next to a full dose and schedule', 'as-needed use whose most allowed dose stays at or under the label maximum, with no written maximum',
  'a high fixed dose exactly at the label maximum', 'a weekly or monthly product written weekly or monthly', 'clear common abbreviations such as qd, qhs or OU',
  'as-needed use with a written daily maximum under the label maximum', 'a liquid or pen whose quantity is a package size', 'an eye or ear drop that names the side',
];

/** The target for each of 4 batches of 16 lines: 9 required calls, 1 or 2 judgment-only, the rest clean. */
function batchTargets(k: number): { required: string[]; judgment: string[]; nearMiss: string[]; plain: number } {
  const req = [...REQUIRED, ...REQUIRED, 'dosage_form_unspecified on a DEA-scheduled drug (law)', 'dosage_form_unspecified on a DEA-scheduled drug (law)'];
  const required = req.filter((_, i) => i % 4 === k);
  const judgment = JUDGMENT.filter((_, i) => i % 4 === k);
  const nearMiss = NEAR_MISS.filter((_, i) => i % 4 === k);
  return { required, judgment, nearMiss, plain: 16 - required.length - judgment.length - nearMiss.length };
}

function genPrompt(k: number, usedDrugs: string[]): string {
  const t = batchTargets(k);
  return `Label conventions (follow them exactly):

${read(path.join(DIR, 'LABEL-CONVENTIONS.md'))}

Write exactly 16 e-prescriptions as one JSON array. Each element:
{
  "input": {"drug_description": string or null, "strength": string or null, "dosage_form": string or null, "sig": string, "quantity": {"value": number, "unit": "tab" | "cap" | "mL" | "g" | "patch" | "supp" | "each"}, "days_supply": number},
  "label": {"flag": {"needed": boolean, "reasons": [...]}, "tier": "law" | "standard" | "judgment" | null, "basis": [{"reason": ..., "kind": ..., "fact": "...", "citation": "..."}], "judgment_only": boolean},
  "checks": [...]
}

"checks" lists every outside fact the label depends on, flagged or not, so a script can verify it:
- {"kind": "fda_max", "generic": "metformin", "release": "er" | "ir" | null, "form": "tablet", "max_daily": {"value": 2000, "unit": "mg"}} for any line whose label depends on a label maximum, including clean lines whose dose is close to the maximum.
- {"kind": "weekly_product", "generic": "...", "form": "...", "interval": "weekly" | "monthly"}
- {"kind": "unit_strength", "generic": "...", "form": "tablet", "written": {"value": 125, "unit": "mg"}, "marketed": {"value": 0.125, "unit": "mg"}}
- {"kind": "controlled_schedule", "generic": "...", "schedule": "2" to "5"}
Use [] when the label depends on no outside fact.

This batch must contain:
- ${t.required.length} lines that require a call, one built on each of these reasons (other reasons may also apply): ${t.required.join(', ')}.
- ${t.judgment.length} judgment-only line(s): ${t.judgment.join(', ') || 'none'}.
- ${t.nearMiss.length} clean near-miss lines that a careless checker would flag, one of each: ${t.nearMiss.join('; ')}.
- ${t.plain} ordinary clean lines that need no call.

Rules for the lines:
- Common US outpatient drugs only. Each drug at most once. Do not use any of these drugs: ${[...excludedDrugs(), ...usedDrugs].join(', ')}.
- Real strengths and products, except where the line is meant to show a unit error.
- Vary the wording the way real prescribers write: abbreviations, full words, capitals, extra words.
- Quantity and days supply consistent with the sig unless the label says otherwise.
- Every fact in a basis must be true. If you are not sure of a label maximum, do not build a line on it.
- Shuffle the order so flagged and clean lines are mixed.
- Reply with the JSON array only.`;
}

async function generate() {
  if (existsSync(SET)) throw new Error('heldout.jsonl already exists. The set is generated once.');
  const auth = assertSubscription();
  const rows: Json[] = [];
  const used: string[] = [];
  const meta: Json[] = [];
  for (let k = 0; k < 4; k++) {
    const prompt = genPrompt(k, used);
    let arr: unknown = null;
    for (let attempt = 0; attempt < 2 && !Array.isArray(arr); attempt++) {
      const r = await claudePrint({ system: GEN_SYSTEM, prompt, timeoutMs: 900_000 });
      writeFileSync(path.join(HO, `raw-generation-${k + 1}${attempt ? `-retry${attempt}` : ''}.txt`), r.text);
      meta.push({ batch: k + 1, attempt, models: r.model, wallMs: r.wallMs, error: r.error, promptSha256: createHash('sha256').update(GEN_SYSTEM + '\n' + prompt).digest('hex') });
      arr = jsonFrom(r.text);
      console.log(`batch ${k + 1} attempt ${attempt + 1}: ${Array.isArray(arr) ? `${arr.length} lines` : `did not parse${r.error ? ` (${r.error})` : ''}`}`);
    }
    if (!Array.isArray(arr)) throw new Error(`batch ${k + 1} did not return a JSON array`);
    for (const x of arr as Json[]) {
      rows.push({ id: `hx-${String(rows.length + 1).padStart(3, '0')}`, batch: k + 1, ...x });
      if (x.input?.drug_description) used.push(String(x.input.drug_description).toLowerCase());
    }
  }
  writeFileSync(SET, rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
  writeFileSync(path.join(HO, 'generation.json'), JSON.stringify({ generatedAt: new Date().toISOString(), by: 'claude CLI print mode, separate sessions, no tools, 4 batches of 16', auth, batches: meta, excludedDrugs: excludedDrugs().length }, null, 1) + '\n');
  const flagged = rows.filter((x) => x.label?.flag?.needed);
  console.log(`generated ${rows.length} lines: flagged ${flagged.length}, judgment-only ${flagged.filter((x) => x.label?.judgment_only).length}, clean ${rows.length - flagged.length}, checks ${rows.reduce((n, x) => n + (x.checks?.length ?? 0), 0)}`);
}

// ─── Verify every cited fact ────────────────────────────────────────────────

const VERIFY_SYSTEM = 'You check one claim against the text of an FDA drug label. Reply with one JSON object and nothing else.';

function releaseWords(c: Json): { must: string[]; mustNot: string[] } {
  const form = String(c.form ?? '').toUpperCase();
  const must: string[] = [];
  const mustNot: string[] = [];
  if (c.release === 'er') must.push('EXTENDED');
  if (c.release === 'ir') mustNot.push('EXTENDED', 'DELAYED');
  for (const w of ['TABLET', 'CAPSULE', 'SOLUTION', 'SUSPENSION', 'INJECTION', 'CREAM', 'PATCH']) if (form.includes(w)) must.push(w);
  return { must, mustNot };
}

export async function checkLabelClaim(c: Json): Promise<Json> {
  const { must, mustNot } = releaseWords(c);
  const sec = await dosageSection(String(c.generic), must, mustNot);
  if (!sec) return { verified: false, why: 'no matching DailyMed label with a Dosage and Administration section' };
  const claim =
    c.kind === 'fda_max'
      ? `The maximum adult daily dose of ${c.generic}${c.release ? ` (${c.release === 'er' ? 'extended release' : 'immediate release'})` : ''} ${c.form ?? ''} is ${c.max_daily?.value} ${c.max_daily?.unit} per day.`
      : `${c.generic} ${c.form ?? ''} is dosed only ${c.interval}, never daily.`;
  const prompt = `Claim: ${claim}\n\nLabel text (${sec.title}):\n${sec.text.slice(0, 24000)}\n\nReply {"supported": true or false, "label_value": "the maximum or schedule the label states, or null", "quote": "a verbatim sentence or phrase from the label text that shows it, copied exactly"}`;
  const r = await claudePrint({ system: VERIFY_SYSTEM, prompt, timeoutMs: 180_000 });
  const j = jsonFrom(r.text) as Json | null;
  const quoteOk = !!j?.quote && quoteFound(String(j.quote), sec.text);
  return { verified: !!j?.supported && quoteOk, supported: j?.supported ?? null, label_value: j?.label_value ?? null, quote: j?.quote ?? null, quote_found: quoteOk, setid: sec.setid, title: sec.title, url: sec.url, error: r.error };
}

const UNIT_MG: Record<string, number> = { mg: 1, mcg: 0.001, g: 1000 };

async function checkUnit(c: Json): Promise<Json> {
  const drugs = await clinicalDrugs(String(c.generic));
  const ing = ingredientsOf(String(c.generic))[0];
  const form = String(c.form ?? '').toLowerCase();
  const inForm = drugs.filter((d) => !form || d.form.includes(form.replace('capsule', 'capsule').replace('tablet', 'tablet')));
  const mgs = inForm.flatMap((d) => d.strengths.filter((s) => s.ingredient.includes(ing) && ['MG', 'MCG', 'G'].includes(s.unit)).map((s) => s.value * UNIT_MG[s.unit.toLowerCase()]));
  const w = c.written ?? {};
  const writtenMg = Number(w.value) * (UNIT_MG[String(w.unit).toLowerCase()] ?? NaN);
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, a, b);
  const writtenExists = mgs.some((m) => close(m, writtenMg));
  const swapExists = mgs.some((m) => close(m, writtenMg / 1000) || close(m, writtenMg * 1000));
  return { verified: !writtenExists && swapExists, written_exists: writtenExists, swap_exists: swapExists, marketed_mg: [...new Set(mgs)].sort((a, b) => a - b), source: 'RxNorm SCD strengths' };
}

async function verify() {
  const rows = loadSet();
  const out: Json = {};
  let n = 0;
  let ok = 0;
  for (const row of rows) {
    const results: Json[] = [];
    for (const c of row.checks ?? []) {
      let res: Json;
      try {
        if (c.kind === 'fda_max' || c.kind === 'weekly_product') res = await checkLabelClaim(c);
        else if (c.kind === 'unit_strength') res = await checkUnit(c);
        else if (c.kind === 'controlled_schedule') {
          const s = await deaSchedule(String(c.generic));
          res = { verified: s.schedule !== null && String(s.schedule) === String(c.schedule).replace(/^C/i, ''), rxnorm_schedule: s.schedule, rxcui: s.rxcui, source: 'RxNorm' };
        } else res = { verified: false, why: `unknown check kind ${c.kind}` };
      } catch (err) {
        res = { verified: false, why: (err as Error).message };
      }
      n++;
      if (res.verified) ok++;
      results.push({ check: c, ...res });
    }
    out[row.id] = { checks: results, all_verified: results.every((r) => r.verified) };
    process.stdout.write(`verified ${row.id}: ${results.filter((r) => r.verified).length}/${results.length}\n`);
  }
  writeFileSync(VERIFY, JSON.stringify(out, null, 1) + '\n');
  const lines = Object.values(out) as Json[];
  console.log(`checks ${ok}/${n} verified. lines with every check verified ${lines.filter((l) => l.all_verified).length}/${lines.length}`);
}

// ─── Second family ──────────────────────────────────────────────────────────

function agy(model: string, prompt: string, timeoutMin: number): Promise<{ text: string; code: number | null; err: string }> {
  return new Promise((resolve) => {
    const child = spawn('agy', ['--model', model, '--print-timeout', `${timeoutMin}m`, '--disable-slash-commands', '-p', prompt], { cwd: HO, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    let err = '';
    const killer = setTimeout(() => child.kill('SIGTERM'), (timeoutMin + 2) * 60_000);
    child.stdout.on('data', (d) => (text += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      clearTimeout(killer);
      resolve({ text, code, err });
    });
  });
}

/**
 * The second family labels every line blind, from the conventions alone, and its labels are
 * compared with the set's. A first run that showed it the labels agreed with all 64 and echoed every
 * reason and tier, which shows nothing, so it is kept as check-second-family-labels-shown.json and
 * this blind relabel is the check.
 */
async function check() {
  const model = process.env.RX_CHECK_MODEL ?? 'Gemini 4 Argon (High)';
  const set = loadSet();
  const rows = set.map((r) => ({ id: r.id, input: r.input }));
  const prompt = `You are a US pharmacist labeling e-prescriptions for a test set, by the label conventions below. Label every line yourself. Do not read or write files and do not run commands. Your final message must be the full result itself: one JSON array with one object per line, {"id": "...", "flag_needed": boolean, "reasons": [...], "tier": "law" | "standard" | "judgment" | null, "judgment_only": boolean, "why": "one short sentence"}.

Label conventions:

${read(path.join(DIR, 'LABEL-CONVENTIONS.md'))}

Lines:

${rows.map((r) => JSON.stringify(r)).join('\n')}`;
  const r = await agy(model, prompt, 25);
  const arr = jsonFrom(r.text);
  const byId = new Map((Array.isArray(arr) ? (arr as Json[]) : []).map((x) => [x.id, x]));
  const compare = set.map((x) => {
    const o = byId.get(x.id);
    if (!o) return { id: x.id, answered: false };
    const flagAgrees = !!o.flag_needed === !!x.label.flag.needed;
    const tierAgrees = (o.tier ?? null) === (x.label.tier ?? null);
    const reasonOverlap = (o.reasons ?? []).some((y: string) => x.label.flag.reasons.includes(y));
    return { id: x.id, answered: true, flagAgrees, tierAgrees, reasonOverlap, second: o };
  });
  writeFileSync(CHECK, JSON.stringify({ model, family: 'google (Antigravity CLI)', method: 'blind relabel from the conventions, then compared', checkedAt: new Date().toISOString(), exit: r.code, parsed: Array.isArray(arr), compare, raw: Array.isArray(arr) ? undefined : r.text.slice(-4000), stderr: r.err.slice(-1000) }, null, 1) + '\n');
  if (!Array.isArray(arr)) throw new Error(`the second family reply did not parse (exit ${r.code})`);
  const ans = compare.filter((c) => c.answered) as Json[];
  console.log(`second family (${model}), blind: answered ${ans.length}/${set.length}. flag agrees ${ans.filter((c) => c.flagAgrees).length}, tier agrees ${ans.filter((c) => c.tierAgrees).length}, flag disagreements ${ans.filter((c) => !c.flagAgrees).length}`);
}

function lock() {
  const files = readdirSync(HO).filter((f) => f !== 'LOCK.json').sort().map((f) => path.join(HO, f));
  files.push(path.join(DIR, 'LABEL-CONVENTIONS.md'));
  const hashes = Object.fromEntries(files.map((f) => [path.relative(ROOT, f), createHash('sha256').update(readFileSync(f)).digest('hex')]));
  writeFileSync(path.join(HO, 'LOCK.json'), JSON.stringify({ lockedAt: new Date().toISOString(), note: 'Frozen before the Rx Intake Check system existed. Scored once, by scripts/rx-intake-score.ts, after the system is frozen.', sha256: hashes }, null, 1) + '\n');
  console.log(`locked ${files.length} files`);
}

const stages: Record<string, () => unknown> = { generate, verify, check, lock };
if (!stages[stage]) {
  console.error('stage must be generate, verify, check or lock');
  process.exit(2);
}
Promise.resolve(stages[stage]()).catch((err) => {
  console.error(`rx heldout ${stage} failed: ${(err as Error).message}`);
  process.exit(1);
});
