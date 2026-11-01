import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const read = p => JSON.parse(readFileSync(p, 'utf8'))
const models = ['gpt-oss:20b', 'gemma4:31b', 'qwen3.8:27b']
const original = ['eval/results/archive/schema-v1/2026-10-30-run1', 'eval/results/archive/schema-v1/2026-10-30-run2', 'eval/results/2026-10-30-v2-run1', 'eval/results/2026-10-30-v2-run2']
const heldout = ['eval/results/heldout-v1', 'eval/results/heldout-v2']
const paths = [...original, ...heldout]
const summaries = paths.map(p => read(`${p}/summary.json`))
const result = (i, model) => summaries[i].results.find(r => r.model === model)
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const text = (x, y, s, size = 18, fill = '#334155') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}">${esc(s)}</text>`
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="740" viewBox="0 0 1200 740"><rect width="1200" height="740" fill="#f8fafc"/><g font-family="Arial, sans-serif">`
svg += text(40, 45, 'Model selection starts with the task definition', 28, '#0f172a')
svg += text(40, 78, 'All requested fields correct. v1 and v2 score different targets, not a causal model improvement.', 18)
for (const [panel, indices, denominator, heading] of [[0, [0, 1, 2, 3], 25, 'Original synthetic set | 25 instructions | two runs'], [1, [4, 5], 12, 'Frozen holdout | 12 instructions | one run']]) {
  const x = 40 + panel * 590
  svg += text(x, 125, heading, 20, '#0f172a')
  for (let m = 0; m < models.length; m++) {
    const y = 170 + m * 135
    svg += text(x, y, models[m], 19, '#0f172a')
    for (let rev = 0; rev < 2; rev++) {
      const ii = panel === 0 ? indices.slice(rev * 2, rev * 2 + 2) : [indices[rev]]
      const counts = ii.map(i => result(i, models[m]).counts.allCorrect)
      const count = counts[0]
      const by = y + 13 + rev * 39
      svg += `<rect x="${x + 40}" y="${by}" width="370" height="24" rx="4" fill="#e2e8f0"/><rect x="${x + 40}" y="${by}" width="${370 * count / denominator}" height="24" rx="4" fill="${rev ? '#4f46e5' : '#64748b'}"/>`
      svg += text(x, by + 18, `v${rev + 1}`, 16)
      svg += text(x + 420, by + 18, counts.map(c => `${c}/${denominator}`).join(', '), 16)
    }
  }
}
svg += text(40, 610, 'Decision: provisional Qwen on original evidence. No model passed every original gate.', 21, '#0f172a')
svg += text(40, 645, 'Original v2 p95: GPT 11.46–11.65 s | Gemma 11.07–20.64 s | Qwen 12.59–16.33 s', 18)
svg += text(40, 676, '10 s budget missed under heavy, uneven load. Disk: GPT 13.8 GB | Gemma 19.4 GB | Qwen 18.2 GB.', 18)
svg += text(40, 708, 'Synthetic screen only. Heldout gold is template-generated, not independently pharmacist reviewed.', 18)
svg += '</g></svg>'
mkdirSync('docs/media', { recursive: true })
writeFileSync('docs/media/results.svg', svg)
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 740 }, deviceScaleFactor: 1 })
  await page.setContent(svg)
  await page.screenshot({ path: 'docs/media/results.png' })
} finally { await browser.close() }

const misses = ['# Published misses', '', 'Generated from committed raw output. Historical v1 and v2 score different fields. Mock misses are all echo output and are omitted here. Every non-mock miss is listed below.', '']
const table = ['# Before and after on both sets', '', '| Set | Model | v1 before | v2 after |', '|---|---|---|---|']
for (const model of models) {
  table.push(`| Original 25, two runs | ${model} | ${[0, 1].map(i => `${result(i, model).counts.allCorrect}/25`).join(', ')} | ${[2, 3].map(i => `${result(i, model).counts.allCorrect}/25`).join(', ')} |`)
  table.push(`| Frozen holdout 12, one run | ${model} | ${result(4, model).counts.allCorrect}/12 | ${result(5, model).counts.allCorrect}/12 |`)
}
table.push('', '## Heldout timing', '', 'One pass per schema on a shared Mac. Load differs by model and revision. These are not controlled speed comparisons.', '', '| Model | v1 p50 / p95 | v2 p50 / p95 | v1 load start / end | v2 load start / end |', '|---|---|---|---|---|')
for (const model of models) {
  const times = [4, 5].map(i => {
    const r = result(i, model)
    return `${(r.latencyMs.p50 / 1000).toFixed(2)} s / ${(r.latencyMs.p95 / 1000).toFixed(2)} s`
  })
  const loads = [4, 5].map(i => {
    const r = result(i, model)
    return `${r.loadAvg1m.start} / ${r.loadAvg1m.end}`
  })
  table.push(`| ${model} | ${times[0]} | ${times[1]} | ${loads[0]} | ${loads[1]} |`)
}
table.push('', 'v1 scores drug, dose and frequency. v2 also scores timing, PRN and PRN reason. Holdout before and after are fresh runs of the unchanged archived and current prompts. No tuning was performed.', '', 'See [protocol and limits](EVALUATION.md) and [every miss](MISSES.md).', '')
for (const dir of paths) {
  for (const model of models) {
    const slug = model.replace(/[^a-zA-Z0-9.-]+/g, '_')
    const rows = readFileSync(`${dir}/raw-${slug}.jsonl`, 'utf8').trim().split('\n').map(JSON.parse)
    for (const row of rows.filter(r => !r.score.allCorrect)) {
      misses.push(`## ${dir.split('/').slice(-1)[0]} | ${model} | ${row.id}`, '', `Input: ${row.input}`, '', 'Expected:', '```json', JSON.stringify(row.gold, null, 2), '```', '', 'Model output:', '```text', row.output, '```', '', `Failed fields: ${Object.entries(row.score).filter(([k, v]) => v === false && !['allCorrect', 'parsed'].includes(k) && (!dir.includes('v1') || ['drug', 'dose', 'frequency', 'medication'].includes(k))).map(([k]) => k).join(', ')}`, '')
    }
  }
}
writeFileSync('docs/MISSES.md', misses.join('\n'))
writeFileSync('docs/RESULTS.md', table.join('\n'))
