import { expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
// The owner extended the historical coverage manifest after the v1 snapshot.
// Preserve that snapshot byte-for-byte and require every old mapping to survive.
const frozenBytes = (file: string) => readFileSync(file === 'eval/extraction-audit/historical-hashes.json'
  ? 'eval/extraction-audit/versions/v1/historical-hashes.original.json' : file)

it('preserves the original historical manifest while validating the owner extension', () => {
  const original = JSON.parse(frozenBytes('eval/extraction-audit/historical-hashes.json').toString())
  const current = JSON.parse(readFileSync('eval/extraction-audit/historical-hashes.json', 'utf8'))
  for (const [file, expected] of Object.entries(original)) expect(current[file], file).toBe(expected)
  expect(Object.keys(current).filter(file => !(file in original)).sort()).toEqual(['docs/EVALUATION.md', 'docs/VERIFICATION.md'])
  for (const [file, expected] of Object.entries(current)) expect(hash(frozenBytes(file)), file).toBe(expected)
})

it('preserves all pre-repair audit inputs, replies, reports, freezes and inspector bytes', () => {
  const manifest = JSON.parse(readFileSync('eval/extraction-audit/versions/v1/frozen-input-hashes.json', 'utf8'))
  for (const [file, expected] of Object.entries(manifest)) expect(hash(frozenBytes(file)), file).toBe(expected)
  const original = readFileSync('eval/extraction-audit/versions/v1/source/scripts/audit-report.ts', 'utf8')
  expect(readFileSync('eval/extraction-audit/versions/v1/source/scripts/audit-report-replay.ts', 'utf8')).toBe(original.replace("if (process.argv.includes('--write')) writeReports()\n", ''))
  const freeze = JSON.parse(readFileSync('eval/extraction-audit/local-20261101-corrected/freeze.json', 'utf8'))
  for (const file of ['src/eval/extractionAudit.ts', 'scripts/audit-report.ts']) expect(hash(readFileSync(`eval/extraction-audit/versions/v1/source/${file}`))).toBe(freeze.hashes[file])
})

it('reproduces every v2 artifact offline from unchanged saved replies', async () => {
  vi.stubGlobal('fetch', () => { throw Error('Network forbidden during requalification') })
  try {
    const { requalification } = await import('../../scripts/audit-requalify-v2')
    const artifacts = requalification()
    const files = readdirSync('eval/extraction-audit/versions/v2', { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => `${f.parentPath}/${f.name}`.replace(/^eval\/extraction-audit\/versions\/v2\//, '')).sort()
    expect(files).toEqual(Object.keys(artifacts).sort())
    for (const [file, value] of Object.entries(artifacts)) {
      const saved = readFileSync(`eval/extraction-audit/versions/v2/${file}`, 'utf8')
      expect(hash(JSON.stringify(value) + '\n'), file).toBe(hash(saved))
    }
    const inspector = artifacts['inspector.json'] as { id: string, name: string }[]
    expect(inspector[0].id).toBe('versions/v2/reports/rules.json')
    expect(inspector.every(r => r.id.startsWith('versions/v2/') && r.name.includes('evaluator v2'))).toBe(true)
  } finally { vi.unstubAllGlobals() }
})

it('refuses legacy writers and existing v2 output without changing evidence', async () => {
  const { spawnSync } = await import('node:child_process')
  const manifest = JSON.parse(readFileSync('eval/extraction-audit/versions/v1/frozen-input-hashes.json', 'utf8'))
  const current = readFileSync('eval/extraction-audit/versions/v2/qualification.json', 'utf8')
  for (const [script, args, message] of [
    ['scripts/audit-report.ts', ['--write'], /Frozen v1 reports are immutable/],
    ['scripts/audit-inspector.ts', ['--write'], /Frozen v1 reports are immutable|V1 inspector evidence is frozen/],
    ['scripts/audit-requalify-v2.ts', ['--out', 'eval/extraction-audit/versions/v2'], /existing evidence is never overwritten/],
  ] as const) {
    const result = spawnSync(process.execPath, ['node_modules/vite-node/vite-node.mjs', script, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(message)
  }
  for (const [file, expected] of Object.entries(manifest)) expect(hash(frozenBytes(file)), file).toBe(expected)
  expect(readFileSync('eval/extraction-audit/versions/v2/qualification.json', 'utf8')).toBe(current)
  // Three vite-node processes in a row. On a busy shared machine that can take longer than the default 5 s.
}, 60000)

it('auto-replays partial v1 freezes and fails closed on an unknown evaluator', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { inspectPartial } = await import('../../scripts/audit-partial')
  const root = 'eval/extraction-audit'
  const known = `${root}/local-20261101-corrected/pass1-qwen3_8_27b`
  expect({ status: 'incomplete, unmeasured', ...inspectPartial(`${known}.json`) }).toEqual(JSON.parse(readFileSync(`${known}-inspection.json`, 'utf8')))
  const dir = mkdtempSync(join(tmpdir(), 'audit-version-'))
  try {
    const freeze = JSON.parse(readFileSync(`${root}/local-20261101-corrected/freeze.json`, 'utf8'))
    const c = JSON.parse(readFileSync(`${root}/public.json`, 'utf8'))[0]
    const path = join(dir, 'saved.json')
    writeFileSync(join(dir, 'freeze.json'), JSON.stringify(freeze))
    writeFileSync(path, JSON.stringify([{ id: c.id, output: JSON.stringify({ entities: [c.gold[0], c.gold[0]] }), error: null, latencyMs: null }]))
    expect(inspectPartial(path).documents.find(d => d.id === c.id)?.supported).toHaveLength(1)
    expect(inspectPartial(path, 'v2').documents.find(d => d.id === c.id)?.supported).toHaveLength(0)
    for (const source of ['src/eval/extractionAudit.ts', 'scripts/audit-report.ts']) freeze.hashes[source] = hash(readFileSync(source))
    writeFileSync(join(dir, 'freeze.json'), JSON.stringify(freeze))
    expect(inspectPartial(path).documents.find(d => d.id === c.id)?.supported).toHaveLength(0)
    freeze.hashes[`${root}/public.json`] = 'changed corpus'
    writeFileSync(join(dir, 'freeze.json'), JSON.stringify(freeze))
    expect(() => inspectPartial(path)).toThrow(/Frozen v2 evaluation differs/)
    freeze.hashes['src/eval/extractionAudit.ts'] = 'unknown'
    writeFileSync(join(dir, 'freeze.json'), JSON.stringify(freeze))
    expect(() => inspectPartial(path)).toThrow(/Unknown frozen evaluator/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
