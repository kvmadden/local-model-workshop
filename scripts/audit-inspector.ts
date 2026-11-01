import { inspectPartial } from './audit-partial'
import { readdirSync, readFileSync } from 'node:fs'
const root = 'eval/extraction-audit'
const read = (file: string) => JSON.parse(readFileSync(`${root}/${file}`, 'utf8'))
const files = ['reports/empty.json', 'reports/everything.json', 'reports/rules.json']
for (const directory of readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && d.name.startsWith('local-'))) {
  for (const file of readdirSync(`${root}/${directory.name}`).filter(f => f.startsWith('report-'))) files.push(`${directory.name}/${file}`)
}
const runs = files.map(file => {
  const r = read(file)
  return { id: file, name: r.name, digest: r.modelDigest, timing: r.timing, status: r.status, splits: r.splits, gallery: r.gallery.map((d: { id: string, failure: string }) => ({ id: d.id, failure: d.failure })), documents: r.documents.map((d: { id: string, supported: unknown[], unsupported: unknown[], missing: unknown[], error: string | null }) => ({ id: d.id, supported: d.supported, unsupported: d.unsupported, missing: d.missing, error: d.error })) }
})
for (const directory of readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && d.name.startsWith('local-'))) {
  const path = directory.name
  if (!readdirSync(`${root}/${path}`).includes('acquisition-status.json')) continue
  const status = read(`${path}/acquisition-status.json`)
  const freeze = read(`${path}/freeze.json`)
  for (const entry of status.files) {
    const partial = inspectPartial(`${root}/${path}/${entry.file}`, 'v1')
    const model = freeze.models.find((m: { model: string }) => entry.file.endsWith(`${m.model.replace(/[^a-z0-9]/gi, '_')}.json`))
    const inspectionFile = `${path}/${entry.file.replace('.json', '-inspection.json')}`
    runs.push({ id: inspectionFile, name: `${model?.model ?? 'local'} incomplete ${partial.acquired}/${partial.expected}`, digest: model?.digest ?? null, timing: 'unmeasured', status: status.status, splits: ['dev', 'final', 'challenge'].map(split => ({ split, tp: null, predicted: null, gold: null })), gallery: partial.gallery, documents: partial.documents })
  }
}
// The control used on first open is fixed, independent of quality scores.
const visibleRuns = runs.filter(r => !r.documents.every((d: { error: string | null }) => d.error))
const ordered = [visibleRuns.find(r => r.id === 'reports/rules.json')!, ...visibleRuns.filter(r => r.id !== 'reports/rules.json')]
export const inspectorRuns = ordered
if (process.argv.includes('--write')) throw new Error('V1 inspector evidence is frozen; use audit:qualify:v2')
