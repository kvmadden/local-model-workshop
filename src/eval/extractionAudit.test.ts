import { expect, it } from 'vitest'
import { scoreEntities, validateSplits, inferenceText, reviewedMetrics, baseline } from './extractionAudit'
const input = 'Aspirin 5 mg daily as needed'
const drug = { task: 'drug', value: 'aspirin', spans: [{ start: 0, end: 7 }] }
const gold = [drug, { task: 'dose', value: '5 mg', spans: [{ start: 8, end: 12 }] }, { task: 'schedule', value: 'daily', spans: [{ start: 13, end: 18 }] }, { task: 'prn', value: 'as needed', spans: [{ start: 19, end: 28 }] }]
it('penalizes a correct drug plus an invented drug', () => {
  expect(scoreEntities(input, [drug], [drug, { ...drug, value: 'warfarin' }]).precision).toBe(0.5)
  expect(scoreEntities(input, [drug], [{ ...drug, value: 'aspirin warfarin' }]).precision).toBe(0)
})
it('rejects wrong dose, lost PRN, invented schedule and nonexistent offsets', () => {
  for (const task of ['dose', 'prn', 'schedule']) {
    const prediction = gold.map(e => e.task === task ? { ...e, value: 'wrong' } : e)
    expect(scoreEntities(input, gold, prediction).exact).toBe(false)
  }
  expect(scoreEntities(input, gold, gold.filter(e => e.task !== 'prn')).missing).toHaveLength(1)
  expect(scoreEntities(input, [drug], [{ ...drug, spans: [{ start: 80, end: 90 }] }]).precision).toBe(0)
})
it('fails a pure invented schedule, a wrong dose on the right span and a dose citing the wrong span', () => {
  const invented = scoreEntities(input, [drug], [drug, { task: 'schedule', value: 'daily', spans: [{ start: 13, end: 18 }] }])
  expect(invented.exact).toBe(false)
  expect(invented.unsupported.map(e => e.task)).toEqual(['schedule'])
  const dose = gold[1]
  const wrongValue = scoreEntities(input, gold, gold.map(e => e === dose ? { ...dose, value: '50 mg' } : e))
  expect(wrongValue.exact).toBe(false)
  expect(wrongValue.missing.map(e => e.task)).toEqual(['dose'])
  const wrongSpan = scoreEntities(input, gold, gold.map(e => e === dose ? { ...dose, spans: [{ start: 0, end: 7 }] } : e))
  expect(wrongSpan.exact).toBe(false)
  const lostPrn = scoreEntities(input, gold, [...gold.filter(e => e.task !== 'prn' && e.task !== 'schedule'), { task: 'schedule', value: 'daily as needed', spans: [{ start: 13, end: 28 }] }])
  expect(lostPrn.exact).toBe(false)
  expect(lostPrn.missing.map(e => e.task).sort()).toEqual(['prn', 'schedule'])
})
it('keeps committed source families inside one split', async () => {
  const { readFileSync } = await import('node:fs')
  const rows = ['public', 'challenge'].flatMap(n => JSON.parse(readFileSync(`eval/extraction-audit/${n}.json`, 'utf8')))
  expect(() => validateSplits(rows)).not.toThrow()
  const bySnapshot = new Map<string, string>()
  for (const r of rows.filter((r: any) => r.source)) {
    expect(bySnapshot.get(r.source.original) ?? r.split).toBe(r.split)
    bySnapshot.set(r.source.original, r.split)
  }
})
it('exposes opposite baseline failures and N/A recall', () => {
  expect(scoreEntities(input, gold, baseline('empty', input)).recall).toBe(0)
  expect(scoreEntities(input, gold, baseline('everything', input)).precision).toBeLessThan(1)
  expect(scoreEntities(input, [], []).recall).toBeNull()
})
it('rejects source derivatives crossing splits', () => {
  expect(() => validateSplits([{ sourceFamily: 'x', split: 'dev' }, { sourceFamily: 'x', split: 'final' }])).toThrow()
})
it('only passes text to inference and cannot promote draft metrics', () => {
  expect(inferenceText({ input, id: 'a', tags: ['x'], gold })).toBe(input)
  expect(inferenceText({ input, id: 'z', tags: ['y'], gold: [] })).toBe(input)
  expect(() => reviewedMetrics([{ review: { status: 'draft' } }])).toThrow()
})

it('validates all committed gold offsets and disjoint source IDs', async () => {
  const { readFileSync } = await import('node:fs')
  const { validEntity } = await import('./extractionAudit')
  const publicRows = JSON.parse(readFileSync('eval/extraction-audit/public.json', 'utf8'))
  const challenge = JSON.parse(readFileSync('eval/extraction-audit/challenge.json', 'utf8'))
  expect(publicRows.filter((r: any) => r.split === 'dev')).toHaveLength(10)
  expect(publicRows.filter((r: any) => r.split === 'final')).toHaveLength(20)
  expect(challenge).toHaveLength(12)
  expect(new Set(publicRows.map((r: any) => r.sourceId)).size).toBe(30)
  for (const c of [...publicRows, ...challenge]) {
    expect(c.review.status).toBe('draft')
    expect(c.gold.every((e: any) => validEntity(c.input, e))).toBe(true)
    expect(scoreEntities(c.input, c.gold, c.gold).exact).toBe(true)
    for (const e of c.gold) {
      if (!e.derivation) expect(c.input.slice(e.spans[0].start, e.spans[0].end).toLowerCase()).toBe(e.value)
    }
  }
})
it('preserves public source text with rights and complete evidence', async () => {
  const { readFileSync } = await import('node:fs')
  const { createHash } = await import('node:crypto')
  const rows = JSON.parse(readFileSync('eval/extraction-audit/public.json', 'utf8'))
  for (const c of rows) {
    const snapshot = JSON.parse(readFileSync(`eval/extraction-audit/${c.source.snapshot}`, 'utf8'))
    expect(snapshot.dosage_and_administration.slice(c.source.start, c.source.end)).toBe(c.input)
    expect(createHash('sha256').update(snapshot.dosage_and_administration).digest('hex')).toBe(c.source.sha256)
    expect(c.source.license).toBe('CC0-1.0')
    expect(c.source.url.startsWith('https://api.fda.gov/')).toBe(true)
  }
})
it('reproduces complete errors and fixed gallery offline with no network', async () => {
  const { vi } = await import('vitest')
  const { readFileSync } = await import('node:fs')
  vi.stubGlobal('fetch', () => { throw new Error('Network disabled') })
  try {
    const { report } = await import('../../scripts/audit-report')
    for (const control of ['empty', 'everything', 'rules']) {
      const rows = JSON.parse(readFileSync(`eval/extraction-audit/${control}.json`, 'utf8'))
      const saved = JSON.parse(readFileSync(`eval/extraction-audit/reports/${control}.json`, 'utf8'))
      expect(report(rows, control)).toEqual(saved)
      expect(saved.gallery).toEqual(saved.errors.slice(0, 8))
    }
  } finally { vi.unstubAllGlobals() }
})
it('keeps generator pools and keys out of the inference dependency path', async () => {
  const { readFileSync } = await import('node:fs')
  const runtime = ['src/eval/auditInference.ts', 'src/engine/flowRunner.ts', 'src/engine/modelAdapter.ts', 'src/engine/templateResolver.ts', 'eval/extraction-audit/prompt.txt', 'eval/extraction-audit/schema.json'].map(p => readFileSync(p, 'utf8')).join('\n')
  expect(runtime).not.toMatch(/public\.json|challenge\.json|gold\.json|label-workshop/)
  const challenge = JSON.parse(readFileSync('eval/extraction-audit/challenge.json', 'utf8'))
  for (const c of challenge) expect(runtime).not.toContain(c.input)
  for (const word of ['candesartan', 'rizatriptan', 'carvedilol', 'liothyronine', 'doxazosin']) expect(runtime.toLowerCase()).not.toContain(word)
})
it('proves metadata changes leave actual adapter requests and outputs invariant', async () => {
  const { inferAudit } = await import('./auditInference')
  const { FlowRunner } = await import('../engine/flowRunner')
  const requests: unknown[] = []
  const runner = new FlowRunner({ executePrompt: async (request: any) => { requests.push(request); return { text: '{"entities":[]}', latencyMs: 0 } } } as any)
  const config = { provider: 'mock' as const, model: 'isolated' }
  const a = await inferAudit(inferenceText({ input, id: 'x', tags: ['secret'], gold }), '{{input}}', config, runner)
  const b = await inferAudit(inferenceText({ input, id: 'changed', tags: ['shuffled'], gold: [] }), '{{input}}', config, runner)
  expect(requests).toHaveLength(2)
  expect(requests[0]).toEqual(requests[1])
  expect(JSON.stringify(requests)).not.toContain('secret')
  expect(a.output).toBe(b.output)
})
it('preserves every historical case, prompt, schema, reply and reported result byte for byte', async () => {
  const { readFileSync } = await import('node:fs')
  const { createHash } = await import('node:crypto')
  const manifest = JSON.parse(readFileSync('eval/extraction-audit/historical-hashes.json', 'utf8'))
  for (const [file, expected] of Object.entries(manifest)) expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(expected)
})
it('reproduces the saved-run inspector from all committed reports without network', async () => {
  const { vi } = await import('vitest')
  const { readFileSync } = await import('node:fs')
  vi.stubGlobal('fetch', () => { throw new Error('Network disabled') })
  try {
    const { inspectorRuns } = await import('../../scripts/audit-inspector')
    expect(inspectorRuns).toEqual(JSON.parse(readFileSync('eval/extraction-audit/inspector.json', 'utf8')))
  } finally { vi.unstubAllGlobals() }
})
it('reproduces partial acquired replies without presenting a complete run', async () => {
  const { vi } = await import('vitest')
  const { readFileSync } = await import('node:fs')
  vi.stubGlobal('fetch', () => { throw new Error('Network disabled') })
  try {
    const { inspectPartial } = await import('../../scripts/audit-partial')
    const path = 'eval/extraction-audit/local-20261101-corrected/pass1-qwen3_8_27b'
    const saved = JSON.parse(readFileSync(`${path}-inspection.json`, 'utf8'))
    expect({ status: 'incomplete, unmeasured', ...inspectPartial(`${path}.json`) }).toEqual(saved)
    expect(saved.acquired).toBeLessThan(saved.expected)
  } finally { vi.unstubAllGlobals() }
})
