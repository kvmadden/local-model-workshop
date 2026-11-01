export const TASKS = ['drug', 'dose', 'schedule', 'timing', 'prn', 'indication', 'abstention'] as const
export interface Span { start: number, end: number }
export interface Entity {
  task: string
  value: string
  spans: Span[]
  derivation?: { operation: 'multiply', operands: number[], unit: string }
}
export interface AuditCase {
  id: string
  split: string
  sourceFamily: string
  input: string
  gold: Entity[]
  review: { status: string, reviewer?: string | null, correction?: string | null }
  ambiguity?: string
  source?: { provider: string, url: string, original: string, snapshot: string, license: string, licenseUrl: string }
}
export const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
const key = (e: Entity) => `${e.task}:${normalize(e.value)}`
const evidence = (e: Entity) => JSON.stringify({ spans: e.spans, derivation: e.derivation ?? null })
export function validEntity(input: string, e: Entity): boolean {
  return !!e && TASKS.includes(e.task as typeof TASKS[number]) && typeof e.value === 'string' && !!e.value.trim() && Array.isArray(e.spans) && e.spans.length > 0 && e.spans.every(s => Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.end > s.start && s.end <= input.length)
}
export function scoreEntities(input: string, gold: Entity[], prediction: Entity[]) {
  if (!gold.every(e => validEntity(input, e))) throw new Error('Invalid gold evidence')
  const expected = new Map(gold.map(e => [key(e), e]))
  const predicted = new Map<string, Entity>()
  prediction.forEach((e, i) => predicted.set(validEntity(input, e) ? key(e) : `invalid:${i}`, e))
  const supported: Entity[] = []
  const unsupported: Entity[] = []
  for (const [k, e] of predicted) {
    const target = expected.get(k)
    if (target && evidence(e) === evidence(target)) supported.push(e)
    else unsupported.push(e)
  }
  const found = new Set(supported.map(key))
  const missing = [...expected].filter(([k]) => !found.has(k)).map(([, e]) => e)
  const tp = supported.length
  return { tp, predicted: predicted.size, gold: expected.size, precision: predicted.size ? tp / predicted.size : null, recall: expected.size ? tp / expected.size : null, exact: !missing.length && !unsupported.length, supported, unsupported, missing }
}
export function validateSplits(rows: { sourceFamily: string, split: string }[]) {
  const seen = new Map<string, string>()
  for (const row of rows) {
    if (seen.has(row.sourceFamily) && seen.get(row.sourceFamily) !== row.split) throw new Error(`Source derivative crosses splits: ${row.sourceFamily}`)
    seen.set(row.sourceFamily, row.split)
  }
}
export function inferenceText(row: { input: string, [key: string]: unknown }): string { return row.input }
export function reviewedMetrics(rows: { review: { status: string, reviewer?: string | null } }[]) {
  if (rows.some(row => row.review.status !== 'reviewed' || !row.review.reviewer)) throw new Error('Draft labels cannot produce reviewed metrics')
  return 'reviewed' as const
}
export function baseline(kind: string, input: string): Entity[] {
  if (kind === 'empty') return []
  const entities: Entity[] = []
  const add = (task: string, regex: RegExp) => {
    for (const match of input.matchAll(regex)) entities.push({ task, value: normalize(match[0]), spans: [{ start: match.index!, end: match.index! + match[0].length }] })
  }
  if (kind === 'rules') {
    // Deliberately narrow, input-only patterns. No drug dictionary or benchmark values.
    add('dose', /\b\d+(?:\.\d+)?\s*(?:mg|mcg|mL|units)\b/gi)
    add('schedule', /\b(?:once daily|twice daily|three times daily|every \d+ hours)\b/gi)
    add('prn', /\b(?:as needed|prn)\b/gi)
  } else if (kind === 'everything') {
    // Verbose stuffing control assigns every word to every task.
    for (const task of TASKS) add(task, /\S+/g)
  } else throw new Error('Unknown control')
  return entities
}
export const FAILURE_ORDER = ['wrong dose', 'invented medication', 'lost PRN/schedule', 'unsupported extra', 'timeout']
export function failureType(score: ReturnType<typeof scoreEntities>, error?: string | null) {
  if (score.missing.some(e => e.task === 'dose') || score.unsupported.some(e => e.task === 'dose')) return FAILURE_ORDER[0]
  if (score.unsupported.some(e => e.task === 'drug')) return FAILURE_ORDER[1]
  if (score.missing.some(e => ['prn', 'schedule'].includes(e.task))) return FAILURE_ORDER[2]
  if (score.unsupported.length || score.missing.length) return FAILURE_ORDER[3]
  return error ? FAILURE_ORDER[4] : null
}
