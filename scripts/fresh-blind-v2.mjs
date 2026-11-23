#!/usr/bin/env node
// Build steps for fresh blind set v2 (docs/FRESH-TEST-PROTOCOL.md).
// Subcommands:
//   assemble <writerFile:family>...   writes eval/fresh-blind-set-v2/lines-written.jsonl
//   dedupe                            Jaccard >= 0.7 against development and template lines,
//                                     writes lines.jsonl and dedupe-record.json. Prints counts only.
//   batches <size> <outDir>           writes labeling batches (id and text only)
//   collect <family> <files>...       merges label replies into labels-<family>.jsonl
//   agreement <famA> <famB>           writes agreement.json, agreement.md, disagreements.json
//   form                              writes adjudication-form.html from disagreements.json
// The development and template lines are read by script only. Their text is never printed.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(ROOT, 'eval/fresh-blind-set-v2');
const readJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
const writeJsonl = (f, rows) => fs.writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n');

// Seeded shuffle (mulberry32) so line order mixes the writers reproducibly.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pull JSON objects out of a reply that may carry prose or code fences.
export function jsonObjects(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const l = raw.trim().replace(/^```(json|jsonl)?/, '').replace(/```$/, '').trim();
    if (!l.startsWith('{')) continue;
    try { out.push(JSON.parse(l)); } catch { /* not a full object on one line */ }
  }
  return out;
}

export const words = (s) => new Set(String(s).normalize('NFKC').toLowerCase().match(/[a-z0-9]+/g) ?? []);
export function jaccard(a, b) {
  const A = words(a), B = words(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

function assemble(args) {
  const rows = [];
  const bad = [];
  for (const arg of args) {
    const [file, family] = arg.split(':');
    for (const o of jsonObjects(fs.readFileSync(file, 'utf8'))) {
      const cats = [...new Set([o.primary, ...(o.categories ?? [])].map(Number))].filter((n) => n >= 1 && n <= 23).sort((x, y) => x - y);
      if (typeof o.text !== 'string' || !o.text.trim() || !cats.length) { bad.push({ family, reason: 'shape' }); continue; }
      rows.push({ text: o.text.trim(), writer: family, primary: Number(o.primary), categories: cats });
    }
  }
  // Exact duplicates inside the written pool.
  const seen = new Set();
  const unique = [];
  let exactDup = 0;
  for (const r of rows) {
    const k = r.text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(k)) { exactDup++; continue; }
    seen.add(k); unique.push(r);
  }
  const r = rng(20261123);
  for (let i = unique.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [unique[i], unique[j]] = [unique[j], unique[i]]; }
  unique.forEach((u, i) => { u.id = `v2-${String(i + 1).padStart(4, '0')}`; });
  writeJsonl(path.join(DIR, 'lines-written.jsonl'), unique.map(({ id, text, writer, primary, categories }) => ({ id, text, writer, primary, categories })));
  console.log(JSON.stringify({ parsed: rows.length, malformed: bad.length, exact_duplicates_dropped: exactDup, kept: unique.length }));
}

function dedupe() {
  const dev = readJsonl(path.join(ROOT, 'eval/sig-extraction/cases.jsonl')).map((c) => ({ ref: `dev:${c.id}`, input: c.input }));
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval/heldout/frozen.json'), 'utf8')).cases.map((c) => ({ ref: `template:${c.id}`, input: c.input }));
  const refs = [...dev, ...tpl];
  const lines = readJsonl(path.join(DIR, 'lines-written.jsonl'));
  const kept = [], dropped = [];
  let maxKept = 0;
  for (const l of lines) {
    let best = { j: 0, ref: null };
    for (const r of refs) { const j = jaccard(l.text, r.input); if (j > best.j) best = { j, ref: r.ref }; }
    if (best.j >= 0.7) dropped.push({ id: l.id, writer: l.writer, max_jaccard: +best.j.toFixed(3), matched: best.ref });
    else { kept.push(l); maxKept = Math.max(maxKept, best.j); }
  }
  writeJsonl(path.join(DIR, 'lines.jsonl'), kept);
  writeJson(path.join(DIR, 'dedupe-record.json'), {
    rule: 'drop a line whose word set has Jaccard similarity >= 0.7 with any development or template line',
    tokenizer: 'NFKC, lowercase, [a-z0-9]+ word set',
    compared_against: { development_lines: dev.length, template_lines: tpl.length },
    lines_checked: lines.length, lines_dropped: dropped.length, lines_kept: kept.length,
    max_jaccard_among_kept: +maxKept.toFixed(3), dropped,
  });
  console.log(JSON.stringify({ checked: lines.length, dropped: dropped.length, kept: kept.length, max_jaccard_among_kept: +maxKept.toFixed(3) }));
}

function batches(size, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const lines = readJsonl(path.join(DIR, 'lines.jsonl'));
  let n = 0;
  for (let i = 0; i < lines.length; i += Number(size)) {
    n++;
    writeJsonl(path.join(outDir, `batch-${String(n).padStart(2, '0')}.jsonl`), lines.slice(i, i + Number(size)).map(({ id, text }) => ({ id, text })));
  }
  console.log(JSON.stringify({ lines: lines.length, batches: n }));
}

function collect(family, files) {
  const ids = new Set(readJsonl(path.join(DIR, 'lines.jsonl')).map((l) => l.id));
  const byId = new Map();
  for (const f of files) for (const o of jsonObjects(fs.readFileSync(f, 'utf8'))) if (ids.has(o.id) && Array.isArray(o.meds)) byId.set(o.id, o);
  const rows = [...ids].filter((id) => byId.has(id)).map((id) => byId.get(id));
  writeJsonl(path.join(DIR, `labels-${family}.jsonl`), rows);
  const missing = [...ids].filter((id) => !byId.has(id));
  console.log(JSON.stringify({ family, labeled: rows.length, missing: missing.length, missing_ids: missing }));
}

// Canonical value for comparison: lowercase trimmed strings, sorted keys, empty arrays and objects as null.
export function canon(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') { const s = v.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '); return s === '' || s === 'null' ? null : s; }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) { const a = v.map(canon).filter((x) => x !== null); return a.length ? a : null; }
  const o = {};
  for (const k of Object.keys(v).sort()) { const c = canon(v[k]); if (c !== null) o[k] = c; }
  return Object.keys(o).length ? o : null;
}
const key = (v) => JSON.stringify(canon(v));
const reasonKey = (v) => (v == null ? 'null' : JSON.stringify(String(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || null));

// Conditions are free text, so they are compared by type and by the numbers they hold
// (thresholds and doses), not by wording.
export function conditionsKey(list) {
  if (!Array.isArray(list) || !list.length) return 'null';
  const parts = list.map((c) => ({ type: canon(c?.type) ?? 'other', numbers: (String(c?.text ?? '').match(/\d+(\.\d+)?/g) ?? []).map(Number).sort((x, y) => x - y) }));
  parts.sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
  return JSON.stringify(parts);
}

export const MED_FIELDS =['ingredient', 'salt_or_release', 'status', 'dose', 'form_quantity', 'dose_basis', 'route', 'schedule', 'anchors', 'as_needed', 'as_needed_reason', 'max_dose_per_period', 'prn_min_interval_h', 'duration', 'phases', 'conditions', 'needs_review_flag'];
export const SIX_FIELDS = ['drug', 'dose_per_administration', 'frequency', 'timing', 'prn', 'prn_indication', 'six_field_representable'];
const CRITICAL = new Set(['ingredient', 'dose', 'schedule', 'route', 'as_needed', 'drug', 'dose_per_administration', 'frequency', 'prn']);

function medValue(m, f) {
  if (!m) return '"<no entry>"';
  if (f === 'needs_review_flag') return key(m.needs_review?.flag ?? false);
  if (f === 'as_needed') return key(m.as_needed ?? false);
  if (f === 'as_needed_reason') return reasonKey(m.as_needed_reason);
  if (f === 'conditions') return conditionsKey(m.conditions);
  return key(m[f]);
}
function sixValue(s, f) {
  if (!s) return '"<missing>"';
  if (f === 'prn_indication') return reasonKey(s.prn_indication);
  if (f === 'prn') return key(s.prn ?? false);
  return key(s[f]);
}

export function kappa(pairs) {
  const n = pairs.length;
  if (!n) return { n: 0, agree: 0, pct: null, kappa: null };
  let agree = 0;
  const ca = new Map(), cb = new Map();
  for (const [a, b] of pairs) { if (a === b) agree++; ca.set(a, (ca.get(a) ?? 0) + 1); cb.set(b, (cb.get(b) ?? 0) + 1); }
  const po = agree / n;
  let pe = 0;
  for (const [k, v] of ca) pe += (v / n) * ((cb.get(k) ?? 0) / n);
  return { n, agree, pct: +(100 * po).toFixed(1), kappa: pe >= 1 ? null : +((po - pe) / (1 - pe)).toFixed(3) };
}

function agreement(famA, famB) {
  const lines = readJsonl(path.join(DIR, 'lines.jsonl'));
  const A = new Map(readJsonl(path.join(DIR, `labels-${famA}.jsonl`)).map((r) => [r.id, r]));
  const B = new Map(readJsonl(path.join(DIR, `labels-${famB}.jsonl`)).map((r) => [r.id, r]));
  const both = lines.filter((l) => A.has(l.id) && B.has(l.id));
  const pairs = Object.fromEntries([...['med_count', ...MED_FIELDS].map((f) => [f, []]), ...SIX_FIELDS.map((f) => [`six.${f}`, []])]);
  const disagreements = [];
  for (const l of both) {
    const a = A.get(l.id), b = B.get(l.id);
    const ma = a.meds ?? [], mb = b.meds ?? [];
    const ca = key(ma.length), cb = key(mb.length);
    pairs.med_count.push([ca, cb]);
    if (ca !== cb) disagreements.push({ id: l.id, text: l.text, field: 'number of drug entries', critical: true, a: ma.length, b: mb.length });
    for (let i = 0; i < Math.max(ma.length, mb.length); i++) {
      for (const f of MED_FIELDS) {
        const va = medValue(ma[i], f), vb = medValue(mb[i], f);
        pairs[f].push([va, vb]);
        if (va !== vb) {
          // Show the labelers' own condition text to Kevin, not the comparison key.
          const show = (m, v) => (f === 'conditions' && m ? m.conditions ?? null : JSON.parse(v));
          disagreements.push({ id: l.id, text: l.text, field: `drug ${i + 1}: ${f}`, critical: CRITICAL.has(f), a: show(ma[i], va), b: show(mb[i], vb) });
        }
      }
    }
    for (const f of SIX_FIELDS) {
      const va = sixValue(a.six_field, f), vb = sixValue(b.six_field, f);
      pairs[`six.${f}`].push([va, vb]);
      if (va !== vb) disagreements.push({ id: l.id, text: l.text, field: `six-field: ${f}`, critical: CRITICAL.has(f), a: JSON.parse(va), b: JSON.parse(vb) });
    }
  }
  const table = Object.fromEntries(Object.entries(pairs).map(([f, p]) => [f, kappa(p)]));
  const linesWithDisagreement = new Set(disagreements.map((d) => d.id)).size;
  const contested = both.filter((l) => [A.get(l.id), B.get(l.id)].some((r) => r.contested === true || (r.meds ?? []).some((m) => m.as_needed && !m.schedule && (m.anchors ?? []).some((x) => x === 'morning' || x === 'evening')))).map((l) => l.id);
  writeJson(path.join(DIR, 'agreement.json'), {
    labelers: [famA, famB], lines_labeled_by_both: both.length, lines_in_set: lines.length,
    lines_with_any_disagreement: linesWithDisagreement, disagreement_items: disagreements.length,
    contested_candidates: contested,
    note: 'Drug-entry fields are compared entry by entry in the order labeled, with n = the larger entry count per line. Kappa is Cohen kappa over the canonical value of the field. Strings are compared lowercased and trimmed. Reasons are compared on their letters and digits. Conditions are compared by type and by the numbers in their text, because their wording is free.Null kappa means chance agreement is 1 (every pair has the same single value).',
    fields: table,
  });
  const md = ['# Label agreement, before adjudication', '', `Labelers: ${famA} (A) and ${famB} (B). Lines labeled by both: ${both.length} of ${lines.length}. Lines with at least one disagreement: ${linesWithDisagreement}. Disagreement items for adjudication: ${disagreements.length}.`, '', '| Field | Agree | n | Percent | Cohen kappa |', '|---|---|---|---|---|',
    ...Object.entries(table).map(([f, t]) => `| ${f} | ${t.agree} | ${t.n} | ${t.pct ?? 'n/a'} | ${t.kappa ?? 'n/a'} |`), ''];
  fs.writeFileSync(path.join(DIR, 'agreement.md'), md.join('\n'));
  writeJson(path.join(DIR, 'disagreements.json'), { labelers: { A: famA, B: famB }, items: disagreements.map((d, i) => ({ n: i + 1, ...d })) });
  console.log(JSON.stringify({ both: both.length, lines_with_disagreement: linesWithDisagreement, items: disagreements.length, contested: contested.length }));
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function form() {
  const { items } = JSON.parse(fs.readFileSync(path.join(DIR, 'disagreements.json'), 'utf8'));
  const byLine = new Map();
  for (const it of items) { if (!byLine.has(it.id)) byLine.set(it.id, { text: it.text, items: [] }); byLine.get(it.id).items.push(it); }
  const show = (v) => esc(v === null ? 'null' : typeof v === 'string' ? v : JSON.stringify(v));
  const blocks = [...byLine].map(([id, g]) => `<section class="line"><h2>${esc(id)}</h2><p class="text">${esc(g.text)}</p>${g.items.map((it) => `
<fieldset data-n="${it.n}"><legend>${esc(it.field)}${it.critical ? ' <span class="crit">critical</span>' : ''}</legend>
<label><input type="radio" name="q${it.n}" value="A"> A: <code>${show(it.a)}</code></label>
<label><input type="radio" name="q${it.n}" value="B"> B: <code>${show(it.b)}</code></label>
<label><input type="radio" name="q${it.n}" value="other"> Other: <input type="text" name="o${it.n}" placeholder="correct value"></label>
</fieldset>`).join('')}</section>`).join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blind Set Adjudication</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#fafaf8;--fg:#1d1d1b;--muted:#6b6b66;--line:#dcdcd6;--card:#fff;--crit:#a33}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#161615;--fg:#ececea;--muted:#a3a39d;--line:#363633;--card:#1f1f1d;--crit:#e88}}
:root[data-theme="dark"]{--bg:#161615;--fg:#ececea;--muted:#a3a39d;--line:#363633;--card:#1f1f1d;--crit:#e88}
body{background:var(--bg);color:var(--fg);font:16px/1.5 "IBM Plex Sans",system-ui,sans-serif;margin:0;padding:16px;max-width:880px;margin-inline:auto}
header{position:sticky;top:0;background:var(--bg);padding:8px 0 12px;border-bottom:1px solid var(--line);z-index:1}
.bar{height:8px;background:var(--line);border-radius:4px;overflow:hidden}.bar>div{height:100%;background:var(--fg);width:0}
.line{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px;margin:16px 0}
h2{font:600 14px "IBM Plex Mono",monospace;margin:0 0 4px;color:var(--muted)}.text{font-size:18px;margin:0 0 12px}
fieldset{border:1px solid var(--line);border-radius:8px;margin:8px 0;padding:8px 12px}legend{font-weight:600;padding:0 4px}
label{display:flex;gap:8px;align-items:center;min-height:44px;flex-wrap:wrap}code{font-family:"IBM Plex Mono",monospace;font-size:14px;overflow-wrap:anywhere}
input[type=text]{flex:1;min-width:160px;min-height:44px;padding:0 8px;font:inherit;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:4px}
.crit{color:var(--crit);font-size:12px;text-transform:uppercase;letter-spacing:.05em}
button{min-height:44px;padding:0 16px;font:600 16px "IBM Plex Sans",sans-serif;border-radius:8px;border:1px solid var(--fg);background:var(--fg);color:var(--bg);cursor:pointer;margin-top:8px}
</style></head><body>
<header><h1 style="margin:0 0 8px;font-size:20px">Pick the right label for each disagreement</h1>
<p style="margin:0 0 8px;color:var(--muted)">${items.length} items on ${byLine.size} lines. Labelers are shown as A and B only. No model output is shown. Answers save in this browser as you go.</p>
<div class="bar"><div id="prog"></div></div><p id="count" style="margin:4px 0 0;font-family:'IBM Plex Mono',monospace"></p>
<button id="dl">Download answers (JSON)</button></header>
${blocks}
<script>
const KEY='blind-v2-adjudication';const total=${items.length};
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
function apply(){for(const [n,v] of Object.entries(saved)){const r=document.querySelector('input[name=q'+n+'][value='+v.pick+']');if(r)r.checked=true;const t=document.querySelector('input[name=o'+n+']');if(t&&v.other)t.value=v.other}}
function update(){const done=Object.values(saved).filter(v=>v.pick).length;document.getElementById('prog').style.width=(100*done/total)+'%';document.getElementById('count').textContent=done+' of '+total+' answered'}
document.addEventListener('change',e=>{const fs=e.target.closest('fieldset');if(!fs)return;const n=fs.dataset.n;const pick=(fs.querySelector('input[type=radio]:checked')||{}).value||null;const other=fs.querySelector('input[type=text]').value||null;saved[n]={pick,other};try{localStorage.setItem(KEY,JSON.stringify(saved))}catch(e){}update()});
document.getElementById('dl').onclick=()=>{const b=new Blob([JSON.stringify({form:'fresh-blind-set-v2 adjudication',answers:saved},null,1)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='adjudication-answers.json';a.click()};
apply();update();
</script></body></html>
`;
  fs.writeFileSync(path.join(DIR, 'adjudication-form.html'), html);
  console.log(JSON.stringify({ items: items.length, lines: byLine.size }));
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'assemble') assemble(rest);
else if (cmd === 'dedupe') dedupe();
else if (cmd === 'batches') batches(rest[0], rest[1]);
else if (cmd === 'collect') collect(rest[0], rest.slice(1));
else if (cmd === 'agreement') agreement(rest[0], rest[1]);
else if (cmd === 'form') form();
else if (cmd) { console.error(`unknown command ${cmd}`); process.exit(2); }
