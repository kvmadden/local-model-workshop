import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import os from 'node:os'
import { inferAudit } from '../src/eval/auditInference'
import { ModelConfig } from '../src/types/flow'
import { root, read, hash, cases, report, SavedRow } from './audit-report'
import { reportV3 } from '../src/eval/extractionAuditV3'
import { isLoopbackUrl } from '../src/engine/modelAdapter'
import { ollamaBaseUrl } from '../src/eval/harness'

// --evaluator v3 asks for quoted evidence and scores facts and evidence separately (src/eval/extractionAuditV3.ts).
// The default stays v2 so the published protocol can be repeated as it was frozen.
const evaluator = process.argv.includes('--evaluator') ? process.argv[process.argv.indexOf('--evaluator') + 1] : 'v2'
if (evaluator !== 'v2' && evaluator !== 'v3') throw new Error('--evaluator must be v2 or v3')
// OLLAMA_HOST is read the way Ollama reads it, so "127.0.0.1:11434" works without a scheme.
const host = ollamaBaseUrl(process.env.OLLAMA_HOST)
if (!isLoopbackUrl(host)) throw new Error(`OLLAMA_HOST ${host} is not this machine. The audit only sends text to a local Ollama.`)
const promptFile = evaluator === 'v3' ? 'prompt-v3.txt' : 'prompt.txt'
const schemaFile = evaluator === 'v3' ? 'schema-v3.json' : 'schema.json'
const config = JSON.parse(read('eval/sig-extraction/models.json')) as { models: { model: string, think: ModelConfig['think'] }[] }
const out = process.argv[process.argv.indexOf('--out') + 1]
if (!process.argv.includes('--out') || !out || existsSync(out)) throw new Error('Pass a new --out directory, existing runs are never overwritten')
mkdirSync(out, { recursive: true })
const files = ['public.json', 'challenge.json', promptFile, schemaFile].map(p => `${root}/${p}`).concat([evaluator === 'v3' ? 'src/eval/extractionAuditV3.ts' : 'src/eval/extractionAudit.ts', 'src/eval/auditInference.ts', 'scripts/audit-infer.ts', 'scripts/audit-report.ts', 'src/engine/flowRunner.ts', 'src/engine/modelAdapter.ts', 'src/engine/templateResolver.ts', 'eval/sig-extraction/models.json'])
const tags = await fetch(`${host}/api/tags`).then(r => r.json())
const available = config.models.filter(m => tags.models.some((t: { name: string }) => t.name === m.model))
const freeze = { createdAt: new Date().toISOString(), hashes: Object.fromEntries(files.map(p => [p, hash(p)])), models: available.map(m => ({ ...m, digest: tags.models.find((t: { name: string }) => t.name === m.model).digest })), missing: config.models.filter(m => !available.includes(m)).map(m => m.model), hardware: { platform: os.platform(), arch: os.arch(), cpus: os.cpus()[0]?.model, memoryBytes: os.totalmem() }, budgetMs: 10000, seed: 20261101, evaluator, review: 'draft', quietMachine: false, note: 'Shared builder machine. Timing is observational and cannot certify a quiet-machine budget.' }
writeFileSync(`${out}/freeze.json`, JSON.stringify(freeze, null, 2) + '\n', { flag: 'wx' })
let state = freeze.seed
const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
function shuffled<T>(values: T[]) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]] }
  return result
}
const schema = JSON.parse(read(`${root}/${schemaFile}`))
const prompt = read(`${root}/${promptFile}`)
const order = shuffled(available)
for (let pass = 1; pass <= 2; pass++) {
  for (const model of pass === 1 ? order : [...order].reverse()) {
    const current = await fetch(`${host}/api/tags`).then(r => r.json())
    if (current.models.find((t: { name: string }) => t.name === model.model)?.digest !== freeze.models.find(m => m.model === model.model)?.digest) throw new Error('Model digest changed')
    for (const file of files) if (hash(file) !== freeze.hashes[file]) throw new Error(`Freeze changed: ${file}`)
    const safe = model.model.replace(/[^a-z0-9]/gi, '_')
    const modelConfig: ModelConfig = { provider: 'ollama', model: model.model, temperature: 0, think: model.think, endpointUrl: `${host}/api/generate`, format: schema, maxTokens: 4096 }
    const start = { at: new Date().toISOString(), load: os.loadavg() }
    // Untimed warm-up outside the evaluation text. Preserve observed first-request latency.
    const cold = await inferAudit('No medication instruction is provided.', prompt, modelConfig)
    const rows: SavedRow[] = []
    const ids = shuffled(cases.map(c => c.id))
    for (const id of ids) {
      const c = cases.find(c => c.id === id)!
      const result = await inferAudit(c.input, prompt, modelConfig)
      rows.push({ id, ...result })
      writeFileSync(`${out}/pass${pass}-${safe}.json`, JSON.stringify(rows) + '\n')
      process.stdout.write(`${pass} ${model.model} ${id} ${result.latencyMs} ${result.error ?? 'ok'}\n`)
    }
    const latencies = rows.filter(r => !r.error && r.latencyMs !== null).map(r => r.latencyMs!).sort((a, b) => a - b)
    const p95 = latencies[Math.ceil(latencies.length * .95) - 1] ?? null
    const scored = evaluator === 'v3' ? { name: model.model, ...reportV3(cases, rows) } : report(rows, model.model)
    const result = { ...scored, modelDigest: freeze.models.find(m => m.model === model.model)!.digest, timing: { start, end: { at: new Date().toISOString(), load: os.loadavg() }, cold, order: ids, p95Ms: p95, successDenominator: latencies.length, requests: rows.length, budgetMs: 10000, observedBudgetMet: rows.every(r => !r.error) && p95 !== null && p95 <= 10000, quietMachineValidated: false } }
    writeFileSync(`${out}/report-pass${pass}-${safe}.json`, JSON.stringify(result) + '\n', { flag: 'wx' })
    await fetch(`${host}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.model, keep_alive: 0 }) })
  }
}
