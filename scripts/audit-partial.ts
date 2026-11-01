import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { cases, parseOutput, SavedRow, hash, root } from './audit-report'
import { scoreEntities, failureType, FAILURE_ORDER } from '../src/eval/extractionAudit'
import { cases as casesV1, parseOutput as parseV1 } from '../eval/extraction-audit/versions/v1/source/scripts/audit-report-replay'
import { scoreEntities as scoreV1, failureType as failureV1, FAILURE_ORDER as orderV1 } from '../eval/extraction-audit/versions/v1/source/src/eval/extractionAudit'
export function inspectPartial(path: string, version: 'v1' | 'v2' | 'auto' = 'auto') {
  if (version === 'auto') {
    const freeze = JSON.parse(readFileSync(`${dirname(path)}/freeze.json`, 'utf8'))
    const sources = ['src/eval/extractionAudit.ts', 'scripts/audit-report.ts']
    if (sources.every(file => hash(`${root}/versions/v1/source/${file}`) === freeze.hashes[file])) version = 'v1'
    else if (sources.every(file => hash(file) === freeze.hashes[file])) version = 'v2'
    else throw Error('Unknown frozen evaluator; choose an explicit requalification version')
  }
  if (version === 'v1') {
    const freeze = JSON.parse(readFileSync(`${dirname(path)}/freeze.json`, 'utf8'))
    for (const file of ['src/eval/extractionAudit.ts', 'scripts/audit-report.ts', `${root}/public.json`, `${root}/challenge.json`]) {
      const source = file.startsWith(root) ? file : `${root}/versions/v1/source/${file}`
      if (hash(source) !== freeze.hashes[file]) throw Error(`Frozen v1 evaluation differs: ${file}`)
    }
  }
  const selectedCases = version === 'v1' ? casesV1 : cases
  const parse = version === 'v1' ? parseV1 : parseOutput
  const classify = version === 'v1' ? failureV1 : failureType
  const order = version === 'v1' ? orderV1 : FAILURE_ORDER
  const rows: SavedRow[] = JSON.parse(readFileSync(path, 'utf8'))
  if (new Set(rows.map(r => r.id)).size !== rows.length || rows.some(r => !selectedCases.some(c => c.id === r.id))) throw new Error('Unknown or duplicate acquired case')
  const documents = selectedCases.map(c => {
    const r = rows.find(r => r.id === c.id)
    if (!r) return { id: c.id, supported: [], unsupported: [], missing: [], error: 'Not measured in this incomplete acquisition', failure: null, output: null }
    const score = (version === 'v1' ? scoreV1 : scoreEntities)(c.input, c.gold, parse(r.output))
    return { id: c.id, supported: score.supported, unsupported: score.unsupported, missing: score.missing, error: r.error, failure: classify(score, r.error), output: r.output }
  })
  const errors = documents.filter(d => d.failure).sort((a, b) => order.indexOf(a.failure!) - order.indexOf(b.failure!) || a.id.localeCompare(b.id))
  return { acquired: rows.length, expected: selectedCases.length, documents, errors, gallery: errors.slice(0, 8).map(d => ({ id: d.id, failure: d.failure! })) }
}
if (process.argv.includes('--file')) {
  const file = process.argv[process.argv.indexOf('--file') + 1]
  process.stdout.write(JSON.stringify(inspectPartial(file)) + '\n')
}
