import { useEffect, useState } from 'react'
import publicCases from '../../eval/extraction-audit/public.json'
import challengeCases from '../../eval/extraction-audit/challenge.json'
import protocolUrl from '../../eval/extraction-audit/AUDIT.md?url'
import inspectorAsset from '../../eval/extraction-audit/versions/v2/inspector.json?url'
import { AuditCase, Entity } from '../eval/extractionAudit'

interface InspectorRun {
  id: string
  name: string
  digest: string | null
  splits: { split: string, tp: number | null, predicted: number | null, gold: number | null }[]
  gallery: { id: string, failure: string }[]
  documents: { id: string, supported: Entity[], missing: Entity[], unsupported: Entity[], error: string | null, output?: string | null }[]
}
const cases = [...publicCases, ...challengeCases] as AuditCase[]
const reportAssets = import.meta.glob(['../../eval/extraction-audit/versions/v2/reports/*.json', '../../eval/extraction-audit/versions/v2/local-*/report-*.json', '../../eval/extraction-audit/versions/v2/local-*/*-inspection.json'], { query: '?url', import: 'default', eager: true }) as Record<string, string>
const repo = 'https://github.com/kvmadden/local-model-workshop/blob/main/eval/extraction-audit'
const MODEL_NAMES: Record<string, string> = { gemma4_31b: 'gemma4:31b', gpt_oss_20b: 'gpt-oss:20b', qwen3_8_27b: 'qwen3.8:27b' }
/** A plain name for a saved run. The file path stays the option's value, out of sight. */
export function runLabel(id: string, name?: string | null): string {
  if (id.endsWith('/reports/empty.json')) return 'Empty control, predicts nothing'
  if (id.endsWith('/reports/everything.json')) return 'Extract-everything control'
  if (id.endsWith('/reports/rules.json')) return 'Narrow rules control'
  const model = MODEL_NAMES[Object.keys(MODEL_NAMES).find(k => id.includes(k)) ?? ''] ?? name ?? 'Saved run'
  const pass = id.match(/pass(\d)/)?.[1]
  if (id.includes('local-20261101-corrected')) return `${model}, pass ${pass}, stopped after 23 of 42 requests`
  if (id.includes('local-20261101/')) return `${model}, pass ${pass}, failed at the endpoint`
  return name ?? model
}
const count = (items: Entity[]) => items.length ? items.map(e => `${e.task}: ${e.value}`).join('\n') : 'None'
export function SavedRunInspector() {
  const [savedRuns, setSavedRuns] = useState<InspectorRun[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    let active = true
    fetch(inspectorAsset).then(response => {
      if (!response.ok) throw new Error('Saved evidence unavailable')
      return response.json()
    }).then(data => { if (active) setSavedRuns(data) }).catch(() => { if (active) setLoadError(true) })
    return () => { active = false }
  }, [])
  const [selected, setSelected] = useState('p01')
  const [runId, setRunId] = useState('versions/v2/reports/rules.json')
  if (!savedRuns) return <p role={loadError ? 'alert' : 'status'} className="text-slate-300">{loadError ? 'Saved evidence could not be loaded. Retry this page.' : 'Loading saved extraction evidence…'}</p>
  const run = savedRuns.find(r => r.id === runId)!
  const c = cases.find(c => c.id === selected)!
  const row = run.documents.find(r => r.id === c.id)!
  const split = run.splits.find(s => s.split === c.split)!
  return <section aria-labelledby="audit-title" className="rounded-2xl border border-slate-700 bg-slate-900 p-4 md:p-6 space-y-5 text-slate-200" data-testid="saved-run-inspector">
    <div className="flex flex-wrap gap-3 items-center justify-between">
      <div><p className="text-indigo-300 text-sm font-bold">SAVED EXTRACTION AUDIT</p><h2 id="audit-title" className="text-2xl font-bold">Does every fact have evidence?</h2></div>
      <span className="rounded-full bg-amber-950/80 text-amber-400 px-3 py-2 text-sm">Draft · pharmacist review pending</span>
    </div>
    <p className="text-slate-300">Inspect the saved controls and acquisition attempts on unchanged public label text, scored by the frozen evaluator that needs exact character offsets. Labels are draft. The quiet-machine 10 second p95 budget has not been validated.</p>
    <div className="grid sm:grid-cols-3 gap-3">
      {[['Source documents', '10 dev · 20 final'], ['Separate challenge', '12 synthetic cases'], ['This set, selected run', split.tp === null ? 'Unmeasured, incomplete acquisition' : `${split.tp}/${split.predicted} supported · ${split.tp}/${split.gold} found`]].map(([label, value]) => <div key={label} className="bg-slate-950 rounded-xl p-4"><p className="text-sm text-slate-400">{label}</p><p className="font-semibold mt-1">{value}</p></div>)}
    </div>
    <label className="block text-sm font-semibold">Saved run
      <select data-testid="audit-run" value={runId} onChange={e => setRunId(e.target.value)} className="block w-full mt-2 min-h-11 bg-slate-950 border border-slate-700 rounded-lg px-3 text-slate-200">
        {savedRuns.map(r => <option key={r.id} value={r.id}>{runLabel(r.id, r.name)}</option>)}
      </select>
    </label>
    <div className="flex flex-wrap gap-4 items-end">
      <label className="w-full sm:flex-1 min-w-0 text-sm font-semibold">Source excerpt
        <select data-testid="audit-case" value={selected} onChange={e => setSelected(e.target.value)} className="block w-full mt-2 min-h-11 bg-slate-950 border border-slate-700 rounded-lg px-3 text-slate-200">
          {cases.map(c => <option key={c.id} value={c.id}>{c.id} · {c.split} · {c.sourceFamily}</option>)}
        </select>
      </label>
      <a href={c.source?.original} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-11 text-indigo-300 underline">Original source</a>
      <a href={c.source?.licenseUrl} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-11 rounded-lg border border-slate-700 px-3 text-indigo-300">{c.source?.license}</a>
    </div>
    <p className="text-sm text-slate-400">{c.source?.provider} · {c.split} · Model digest: {run.digest ?? 'N/A, deterministic control or failed acquisition'} · Reviewer correction: {c.review.correction ?? 'None recorded'}</p>
    {row.error && <p className="text-rose-300">Acquisition error: {row.error}. This is not a measured extraction output.</p>}
    {row.output !== undefined && row.output !== null && <details><summary className="min-h-11 cursor-pointer flex items-center font-semibold">Original saved model reply</summary><pre className="whitespace-pre-wrap break-words bg-slate-950 rounded-xl p-4 text-sm max-h-80 overflow-auto" tabIndex={0}>{row.output}</pre></details>}
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="min-w-0 space-y-3"><h3 className="font-bold">Original input</h3><blockquote className="bg-slate-950 border border-slate-700 rounded-xl p-4 whitespace-pre-wrap break-words text-sm leading-relaxed max-h-80 overflow-auto" tabIndex={0}>{c.input}</blockquote><p className="text-sm text-amber-400">{c.ambiguity}</p></div>
      <div className="min-w-0 space-y-3"><h3 className="font-bold">Supported and missing facts</h3><pre className="bg-slate-950 rounded-xl p-4 text-sm whitespace-pre-wrap break-words max-h-40 overflow-auto" tabIndex={0}>{count(row.supported as Entity[])}</pre><details><summary className="min-h-11 cursor-pointer flex items-center text-rose-300">{row.missing.length} missing · {row.unsupported.length} unsupported</summary><pre className="whitespace-pre-wrap break-words text-sm bg-slate-950 p-4 rounded-xl">{`Missing\n${count(row.missing)}\n\nUnsupported\n${count(row.unsupported)}`}</pre></details></div>
    </div>
    <details><summary className="min-h-11 cursor-pointer flex items-center font-semibold">Exact spans and derivations</summary><ul className="space-y-2 text-sm">{c.gold.map((e, i) => <li key={i} className="bg-slate-950 rounded-lg p-3 break-words"><strong>{e.task}: {e.value}</strong>{e.spans.map((s, j) => <p key={j}>[{s.start}, {s.end}) “{c.input.slice(s.start, s.end)}”</p>)}{e.derivation && <p>Multiply {e.derivation.operands.join(' × ')} = {e.value}</p>}</li>)}</ul></details>
    <div><h3 className="font-bold">Failure gallery, fixed order</h3><p className="text-sm text-slate-400 mt-1">Wrong dose, invented medication, lost PRN or schedule, unsupported extra, timeout, then case ID. First eight failures.</p><div className="flex flex-wrap gap-2 mt-3">{run.gallery.map(r => <button key={r.id} onClick={() => setSelected(r.id)} className="min-h-11 border border-slate-700 rounded-lg px-3 text-sm text-rose-300">{r.id} · {r.failure}</button>)}</div></div>
    <div className="flex flex-wrap gap-x-5"><a className="min-h-11 inline-flex items-center underline text-indigo-300" href={reportAssets[`../../eval/extraction-audit/${run.id}`] ?? `${repo}/${run.id}`}>Complete errors and intervals</a><a className="min-h-11 inline-flex items-center underline text-indigo-300" href={protocolUrl}>Protocol and review limits</a></div>
    <p className="text-sm text-slate-400">Fixed public benchmark, not a blind test. Labels are AI-proposed drafts. No second independent review or clinical validation. Historical runs remain separate.</p>
  </section>
}
