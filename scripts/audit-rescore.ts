import { readdirSync } from 'node:fs'
import { root, read, hash, report, SavedRow } from './audit-report'
const directory = process.argv[process.argv.indexOf('--run') + 1]
if (!process.argv.includes('--run') || !directory) throw new Error('Pass --run with a saved run directory')
const freeze = JSON.parse(read(`${directory}/freeze.json`))
const evaluatorFiles = ['src/eval/extractionAudit.ts', 'scripts/audit-report.ts']
const archive = `${root}/versions/v1/source`
const legacy = evaluatorFiles.every(file => hash(`${archive}/${file}`) === freeze.hashes[file])
const reproduce = legacy ? (await import('../eval/extraction-audit/versions/v1/source/scripts/audit-report-replay')).report : report
for (const file of [`${root}/public.json`, `${root}/challenge.json`, 'src/eval/extractionAudit.ts', 'scripts/audit-report.ts']) {
  if (hash(legacy && evaluatorFiles.includes(file) ? `${archive}/${file}` : file) !== freeze.hashes[file]) throw new Error(`Frozen evaluation differs: ${file}`)
}
for (const file of readdirSync(directory).filter(f => f.startsWith('report-pass'))) {
  const saved = JSON.parse(read(`${directory}/${file}`))
  const raw = file.replace('report-', '')
  const rows: SavedRow[] = JSON.parse(read(`${directory}/${raw}`))
  const reproduced = reproduce(rows, saved.name)
  for (const field of ['splits', 'documents', 'errors', 'gallery', 'corpusHashes'] as const) {
    if (JSON.stringify(reproduced[field]) !== JSON.stringify(saved[field])) throw new Error(`Mismatch: ${file} ${field}`)
  }
  process.stdout.write(`${file}: complete errors, gallery, counts and intervals reproduced offline\n`)
}
