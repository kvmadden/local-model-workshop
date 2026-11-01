import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { root, read, hash, report, SavedRow } from './audit-report'
import { inspectPartial } from './audit-partial'

// Re-score saved replies only. No inference, acquisition or historical writes.
export function requalification() {
  const artifacts: Record<string, unknown> = {}
  const inputs = new Set<string>([`${root}/public.json`, `${root}/challenge.json`])
  const inspector: Record<string, unknown>[] = []
  const add = (file: string, value: ReturnType<typeof report>) => {
    artifacts[file] = value
    if (value.documents.every(d => d.error)) return
    inspector.push({ id: `versions/v2/${file}`, name: `${value.name} · evaluator v2`, digest: value.modelDigest, timing: value.timing, status: value.status, splits: value.splits, gallery: value.gallery.map(d => ({ id: d.id, failure: d.failure })), documents: value.documents.map(d => ({ id: d.id, supported: d.supported, unsupported: d.unsupported, missing: d.missing, error: d.error })) })
  }
  // Fix first-open control independently of metric values.
  for (const name of ['rules', 'empty', 'everything']) {
    const file = `${root}/${name}.json`; inputs.add(file)
    add(`reports/${name}.json`, report(JSON.parse(read(file)), name))
  }
  for (const directory of readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && d.name.startsWith('local-')).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${root}/${directory.name}`
    const files = readdirSync(path).sort()
    for (const file of files.filter(f => f.startsWith('report-'))) {
      const priorFile = `${path}/${file}`, raw = `${path}/${file.replace('report-', '')}`
      inputs.add(priorFile); inputs.add(raw)
      const prior = JSON.parse(read(priorFile))
      const rows: SavedRow[] = JSON.parse(read(raw))
      // Preserve observed model identity and timing; this is no new model run.
      const current = { ...report(rows, prior.name), modelDigest: prior.modelDigest, timing: prior.timing }
      add(`${directory.name}/${file}`, current)
    }
    if (!files.includes('acquisition-status.json')) continue
    const statusFile = `${path}/acquisition-status.json`, freezeFile = `${path}/freeze.json`
    inputs.add(statusFile); inputs.add(freezeFile)
    const status = JSON.parse(read(statusFile)), freeze = JSON.parse(read(freezeFile))
    for (const entry of status.files) {
      const raw = `${path}/${entry.file}`; inputs.add(raw)
      const partial = inspectPartial(raw, 'v2')
      const file = `${directory.name}/${entry.file.replace('.json', '-inspection.json')}`
      artifacts[file] = { evaluatorVersion: 'v2', status: 'incomplete, unmeasured', ...partial }
      if (partial.documents.every(d => d.error)) continue
      const model = freeze.models.find((m: { model: string }) => entry.file.endsWith(`${m.model.replace(/[^a-z0-9]/gi, '_')}.json`))
      inspector.push({ id: `versions/v2/${file}`, name: `${model?.model ?? 'local'} incomplete ${partial.acquired}/${partial.expected} · evaluator v2`, digest: model?.digest ?? null, timing: 'unmeasured', status: status.status, splits: ['dev', 'final', 'challenge'].map(split => ({ split, tp: null, predicted: null, gold: null })), gallery: partial.gallery, documents: partial.documents })
    }
  }
  artifacts['inspector.json'] = inspector
  const sources = ['src/eval/extractionAudit.ts', 'scripts/audit-report.ts', 'scripts/audit-partial.ts', 'scripts/audit-requalify-v2.ts']
  artifacts['qualification.json'] = { evaluatorVersion: 'v2', status: 'draft, pending pharmacist review', method: 'Offline re-score of unchanged saved replies; no new inference or timing measurements', inputs: Object.fromEntries([...inputs].sort().map(file => [file, hash(file)])), sources: Object.fromEntries(sources.map(file => [file, hash(file)])) }
  return artifacts
}

if (process.argv.includes('--out')) {
  const out = process.argv[process.argv.indexOf('--out') + 1]
  if (!out || resolve(out) !== resolve(`${root}/versions/v2`) || existsSync(out)) throw new Error('Use the new eval/extraction-audit/versions/v2 directory; existing evidence is never overwritten')
  const artifacts = requalification()
  mkdirSync(out, { recursive: true })
  for (const [file, data] of Object.entries(artifacts)) {
    const target = join(out, file)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, JSON.stringify(data) + '\n', { flag: 'wx' })
  }
  process.stdout.write(`Qualified ${Object.keys(artifacts).length} v2 artifacts from saved replies; frozen v1 evidence unchanged\n`)
}

if (process.argv.includes('--check')) {
  const out = `${root}/versions/v2`
  const artifacts = requalification()
  const files = readdirSync(out, { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => `${f.parentPath}/${f.name}`.slice(out.length + 1)).sort()
  if (JSON.stringify(files) !== JSON.stringify(Object.keys(artifacts).sort())) throw Error('V2 artifact inventory differs')
  for (const [file, data] of Object.entries(artifacts)) {
    if (read(`${out}/${file}`) !== JSON.stringify(data) + '\n') throw Error(`V2 artifact differs: ${file}`)
  }
  process.stdout.write('All v2 saved reports and inspector artifacts reproduced offline; no files written\n')
}
