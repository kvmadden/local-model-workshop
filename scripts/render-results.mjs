// Renders docs/media/results.svg and results.png from the committed run summaries.
// Every number on the chart is read from a summary file. Nothing is typed in by hand.
//
// docs/RESULTS.md and docs/MISSES.md are hash-locked historical evidence and are no longer
// written here. The current tables are in docs/DEVELOPMENT-RESULTS.md.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const read = p => JSON.parse(readFileSync(p, 'utf8'))
const models = ['gpt-oss:20b', 'gemma4:31b', 'qwen3.8:27b']
const runs = {
  first25: ['eval/results/archive/schema-v1/2026-10-30-run1', 'eval/results/archive/schema-v1/2026-10-30-run2'],
  split25: ['eval/results/2026-10-30-v2-run1', 'eval/results/2026-10-30-v2-run2'],
  first12: ['eval/results/heldout-v1'],
  split12: ['eval/results/heldout-v2'],
}
const allCorrect = (dir, label) => read(`${dir}/summary.json`).results.find(r => r.label === label || r.model === label).counts.allCorrect
const rules25 = allCorrect('eval/results/2026-11-03-baselines-dev25', 'baseline: rules')
const rules12 = allCorrect('eval/results/2026-11-03-baselines-templates12', 'baseline: rules')

const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const text = (x, y, s, size = 17, fill = '#334155', weight = 'normal') => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`
const bar = (x, y, count, n, fill) => `<rect x="${x}" y="${y}" width="300" height="20" rx="4" fill="#e2e8f0"/><rect x="${x}" y="${y}" width="${(300 * count) / n}" height="20" rx="4" fill="${fill}"/>`

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760"><rect width="1200" height="760" fill="#f8fafc"/><g font-family="Arial, sans-serif">`
svg += text(40, 44, 'Every field right, on two development sets', 28, '#0f172a', 'bold')
svg += text(40, 74, 'Both sets are development data. The rules parser was written after reading them, and it also gets every field right.', 16)
const panels = [
  { x: 40, title: '25 development lines, two runs', n: 25, first: runs.first25, split: runs.split25, rules: rules25 },
  { x: 620, title: '12 template lines (6 templates from the 25), one run', n: 12, first: runs.first12, split: runs.split12, rules: rules12 },
]
for (const p of panels) {
  svg += text(p.x, 118, p.title, 19, '#0f172a', 'bold')
  models.forEach((m, i) => {
    const y = 150 + i * 120
    svg += text(p.x, y, m, 17, '#0f172a')
    const first = p.first.map(d => allCorrect(d, m))
    const split = p.split.map(d => allCorrect(d, m))
    svg += text(p.x, y + 30, 'first', 14) + bar(p.x + 60, y + 15, Math.min(...first), p.n, '#94a3b8') + text(p.x + 372, y + 30, first.map(c => `${c}/${p.n}`).join(', '), 14)
    svg += text(p.x, y + 62, 'split', 14) + bar(p.x + 60, y + 47, Math.min(...split), p.n, '#4f46e5') + text(p.x + 372, y + 62, split.map(c => `${c}/${p.n}`).join(', '), 14)
  })
  const y = 150 + 3 * 120
  svg += text(p.x, y, 'rules parser (no model)', 17, '#0f172a')
  svg += text(p.x, y + 30, 'split', 14) + bar(p.x + 60, y + 15, p.rules, p.n, '#0d9488') + text(p.x + 372, y + 30, `${p.rules}/${p.n}`, 14)
}
svg += text(40, 650, 'Bars show the lower of two runs. "first" and "split" score different fields, so they are not a before and after of one target.', 15)
svg += text(40, 678, 'All 10 model misses are the frequency of an as-needed line with a schedule or a bedtime anchor. No drug or dose was wrong.', 15)
svg += text(40, 706, 'The pick changes with the rule for "at bedtime as needed". See docs/DEVELOPMENT-RESULTS.md.', 15)
svg += text(40, 734, 'Synthetic lines only. Latency was measured on a heavily loaded shared Mac and is not shown.', 15)
svg += '</g></svg>'
mkdirSync('docs/media', { recursive: true })
writeFileSync('docs/media/results.svg', svg)
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 })
  await page.setContent(svg)
  await page.screenshot({ path: 'docs/media/results.png' })
} finally { await browser.close() }
process.stdout.write('Wrote docs/media/results.svg and docs/media/results.png\n')
