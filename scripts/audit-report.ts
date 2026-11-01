import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { AuditCase, Entity, TASKS, scoreEntities, failureType, FAILURE_ORDER, validateSplits } from '../src/eval/extractionAudit'
export const root = 'eval/extraction-audit'
export const read = (p: string) => readFileSync(p, 'utf8')
export const hash = (p: string) => createHash('sha256').update(read(p)).digest('hex')
export const cases: AuditCase[] = ['public', 'challenge'].flatMap(name => JSON.parse(read(`${root}/${name}.json`)))
validateSplits(cases)
if (new Set(cases.map(c => c.id)).size !== cases.length) throw new Error('Duplicate case ID')
export interface SavedRow { id: string, output: string, error: string | null, latencyMs: number | null }
export function parseOutput(output: string): Entity[] {
  try {
    const value = JSON.parse(output)
    if (!Array.isArray(value.entities)) throw new Error('Missing entities')
    return value.entities.map((e: Entity) => e && typeof e.task === 'string' && typeof e.value === 'string' && Array.isArray(e.spans) ? e : { task: 'invalid', value: 'invalid', spans: [] })
  } catch { return [{ task: 'invalid', value: 'unparseable output', spans: [] }] }
}
export function report(rows: SavedRow[], name: string) {
  if (rows.length !== cases.length || new Set(rows.map(r => r.id)).size !== cases.length || rows.some(r => !cases.some(c => c.id === r.id))) throw new Error('Incomplete or duplicate run')
  const documents = cases.map(c => {
    const row = rows.find(r => r.id === c.id)!
    const score = scoreEntities(c.input, c.gold, parseOutput(row.output))
    return { id: c.id, split: c.split, sourceFamily: c.sourceFamily, ...score, failure: failureType(score, row.error), error: row.error, latencyMs: row.latencyMs }
  })
  const ratio = (a: number, b: number) => b ? a / b : null
  // Bootstrap draws reuse immutable scored documents.
  const counts = new Map(documents.map(d => [d, { tp: d.supported.length, extra: d.unsupported.length, missing: d.missing.length }]))
  const totals = (docs: typeof documents, task?: string) => {
    const tp = docs.reduce((n, d) => n + (task ? d.supported.filter(e => e.task === task).length : counts.get(d)!.tp), 0)
    const extra = docs.reduce((n, d) => n + (task ? d.unsupported.filter(e => e.task === task).length : counts.get(d)!.extra), 0)
    const missing = docs.reduce((n, d) => n + (task ? d.missing.filter(e => e.task === task).length : counts.get(d)!.missing), 0)
    return { tp, predicted: tp + extra, gold: tp + missing, unsupported: extra, missing, precision: ratio(tp, tp + extra), recall: ratio(tp, tp + missing) }
  }
  // Seeded document-cluster bootstrap. Resample source families, not individual facts.
  let seed = 20261101
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const splits = ['dev', 'final', 'challenge'].map(split => {
    const docs = documents.filter(d => d.split === split)
    const families = [...new Set(docs.map(d => d.sourceFamily))]
    const draws = Array.from({ length: 1000 }, () => totals(families.flatMap(() => { const f = families[Math.floor(rand() * families.length)]; return docs.filter(d => d.sourceFamily === f) })))
    const interval = (field: 'precision' | 'recall') => {
      const values = draws.map(d => d[field]).filter((v): v is number => v !== null).sort((a, b) => a - b)
      return values.length ? [values[Math.floor(values.length * .025)], values[Math.min(values.length - 1, Math.floor(values.length * .975))]] : null
    }
    return { split, documents: docs.length, ...totals(docs), abstentions: docs.filter(d => d.predicted === 0).length, exact: docs.filter(d => d.exact).length, perTask: Object.fromEntries(TASKS.map(task => [task, totals(docs, task)])), bootstrap95: { precision: interval('precision'), recall: interval('recall'), samples: 1000, unit: 'source document family', seed: 20261101 } }
  })
  const errors = documents.filter(d => d.failure).sort((a, b) => FAILURE_ORDER.indexOf(a.failure!) - FAILURE_ORDER.indexOf(b.failure!) || a.id.localeCompare(b.id))
  return { evaluatorVersion: 'v2', name, status: 'draft, pending pharmacist review', reviewedMetrics: null, modelDigest: null, timing: 'unmeasured for controls', corpusHashes: { public: hash(`${root}/public.json`), challenge: hash(`${root}/challenge.json`) }, splits, errors, gallery: errors.slice(0, 8), documents }
}
if (process.argv.includes('--write')) throw new Error('Frozen v1 reports are immutable. Use npm run audit:qualify:v2 with a new --out directory.')
