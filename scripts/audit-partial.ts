import { readFileSync } from 'node:fs'
import { cases, parseOutput, SavedRow } from './audit-report'
import { scoreEntities, failureType, FAILURE_ORDER } from '../src/eval/extractionAudit'
export function inspectPartial(path: string) {
  const rows: SavedRow[] = JSON.parse(readFileSync(path, 'utf8'))
  if (new Set(rows.map(r => r.id)).size !== rows.length || rows.some(r => !cases.some(c => c.id === r.id))) throw new Error('Unknown or duplicate acquired case')
  const documents = cases.map(c => {
    const r = rows.find(r => r.id === c.id)
    if (!r) return { id: c.id, supported: [], unsupported: [], missing: [], error: 'Not measured in this incomplete acquisition', failure: null, output: null }
    const score = scoreEntities(c.input, c.gold, parseOutput(r.output))
    return { id: c.id, supported: score.supported, unsupported: score.unsupported, missing: score.missing, error: r.error, failure: failureType(score, r.error), output: r.output }
  })
  const errors = documents.filter(d => d.failure).sort((a, b) => FAILURE_ORDER.indexOf(a.failure!) - FAILURE_ORDER.indexOf(b.failure!) || a.id.localeCompare(b.id))
  return { acquired: rows.length, expected: cases.length, documents, errors, gallery: errors.slice(0, 8).map(d => ({ id: d.id, failure: d.failure! })) }
}
if (process.argv.includes('--file')) {
  const file = process.argv[process.argv.indexOf('--file') + 1]
  process.stdout.write(JSON.stringify(inspectPartial(file)) + '\n')
}
