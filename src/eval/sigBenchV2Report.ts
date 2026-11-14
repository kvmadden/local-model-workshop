/**
 * The model comparison for sig bench v2: every source scored on the two label subsets, never
 * pooled, and the tables for bench/sig-bench/RESULTS-v2.md. Pure functions, no I/O. The command is
 * scripts/sig-bench-v2-report.ts.
 *
 * - reviewed: label_status confirmed or kevin-notes, the lines Kevin Madden, PharmD, reviewed.
 * - proposed: lines nobody has reviewed. Scores against them are provisional.
 */
import { rulesV2 } from './sigBaselinesV2';
import { READING_FIELDS, addScore, emptySummary, scoreV2Reply, type V2Item, type V2Score, type V2Summary } from './sigBenchV2Score';
import { parsePredictionV3 } from './sigScoreV3';

export const RESULTS_START = '<!-- generated:start (npm run bench:sig:v2:report) -->';
export const RESULTS_END = '<!-- generated:end -->';

export type Subset = 'reviewed' | 'proposed';
export const SUBSETS: Subset[] = ['reviewed', 'proposed'];
export const subsetOf = (it: V2Item): Subset => (it.label_status === 'proposed' ? 'proposed' : 'reviewed');

/** One reply as scripts/sig-bench-v2-run.ts writes it. */
export interface RawRow {
  id: string;
  label_status: string;
  source: string;
  output: string;
  error: string | null;
  wallMs: number;
  load1m: number;
}

export interface ReportLine {
  id: string;
  parsed: boolean;
  error: string | null;
  wallMs: number | null;
  flagGold: boolean;
  flagReply: boolean | null;
  reasons: unknown[];
  tierGold: string | null;
  tierReply: string | null;
  readingAllCorrect: boolean | null;
  wrongFields: string[];
  callRequired: boolean;
}

export interface ReportExtra {
  ran: number;
  of: number;
  errors: number;
  parseFailures: number;
  /** Lines the label flags for a real reason (not only reviewer_hold), and how many the reply flagged. */
  caught: { items: number; flagged: number };
  /** Lines the label does not flag, and how many the reply flagged anyway. */
  falseAlarms: { items: number; flagged: number };
  /** Parsed replies that said no call is needed on a line where law or a standard requires one. */
  dispensedGuess: number;
  wallMs: { median: number | null; p90: number | null; total: number };
}

export interface Scored {
  summary: V2Summary;
  extra: ReportExtra;
  lines: ReportLine[];
}

export interface SourceResult {
  source: string;
  kind: 'rules' | 'model';
  subsets: Record<Subset, Scored>;
}

export const isHoldOnly = (it: V2Item) => it.label.flag.reasons.length > 0 && it.label.flag.reasons.every((r) => r === 'reviewer_hold');

function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

/** Scores replies on one subset. A reply with an error is scored as no reply. */
export function scoreRows(rows: Array<{ item: V2Item; text: string; error: string | null; wallMs: number | null }>, of: number): Scored {
  const summary = emptySummary();
  const lines: ReportLine[] = [];
  const extra: ReportExtra = { ran: rows.length, of, errors: 0, parseFailures: 0, caught: { items: 0, flagged: 0 }, falseAlarms: { items: 0, flagged: 0 }, dispensedGuess: 0, wallMs: { median: null, p90: null, total: 0 } };
  for (const { item, text, error, wallMs } of rows) {
    const s: V2Score = scoreV2Reply(item, error ? '' : text);
    addScore(summary, s);
    if (error) extra.errors++;
    if (!s.parsed) extra.parseFailures++;
    if (item.label.flag.needed && !isHoldOnly(item)) {
      extra.caught.items++;
      if (s.flag.reply === true) extra.caught.flagged++;
    }
    if (!item.label.flag.needed) {
      extra.falseAlarms.items++;
      if (s.flag.reply === true) extra.falseAlarms.flagged++;
    }
    if (s.callRequiredWithReading && s.parsed && s.flag.reply === false) extra.dispensedGuess++;
    const p = error ? null : (parsePredictionV3(text).value as Record<string, unknown> | null);
    const flag = p && typeof p.flag === 'object' && p.flag ? (p.flag as Record<string, unknown>) : null;
    lines.push({
      id: item.id,
      parsed: s.parsed,
      error,
      wallMs,
      flagGold: s.flag.gold,
      flagReply: s.flag.reply,
      reasons: Array.isArray(flag?.reasons) ? (flag!.reasons as unknown[]) : [],
      tierGold: s.tier?.gold ?? null,
      tierReply: s.tier?.reply ?? null,
      readingAllCorrect: s.reading ? s.reading.allCorrect : null,
      wrongFields: s.reading ? READING_FIELDS.filter((f) => !s.reading!.fields[f]) : [],
      callRequired: s.callRequiredWithReading,
    });
  }
  const times = rows.map((r) => r.wallMs).filter((x): x is number => x !== null);
  extra.wallMs = { median: quantile(times, 0.5), p90: quantile(times, 0.9), total: times.reduce((a, b) => a + b, 0) };
  return { summary, extra, lines };
}

const ORDER = ['claude:', 'ollama:gemma4', 'ollama:qwen3.8', 'ollama:gpt-oss', 'ollama:llama3.2'];
const rank = (s: string) => {
  const i = ORDER.findIndex((p) => s.startsWith(p));
  return i === -1 ? ORDER.length : i;
};

/** The rules parser and every model's raw replies, scored per subset. `raws` holds one list per source. */
export function scoreSources(items: V2Item[], raws: RawRow[][]): SourceResult[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const subsetItems = (s: Subset) => items.filter((i) => subsetOf(i) === s);
  const results: SourceResult[] = [
    {
      source: 'rules parser',
      kind: 'rules',
      subsets: Object.fromEntries(
        SUBSETS.map((s) => [s, scoreRows(subsetItems(s).map((item) => ({ item, text: JSON.stringify(rulesV2(item.input)), error: null, wallMs: null })), subsetItems(s).length)]),
      ) as Record<Subset, Scored>,
    },
  ];
  for (const rows of raws.filter((r) => r.length).sort((a, b) => rank(a[0].source) - rank(b[0].source) || a[0].source.localeCompare(b[0].source))) {
    const source = rows[0].source;
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.source !== source) throw new Error(`${source}: a row from ${r.source} is in its file`);
      if (seen.has(r.id)) throw new Error(`${source}: ${r.id} appears twice`);
      if (!byId.has(r.id)) throw new Error(`${source}: ${r.id} is not a bench item`);
      seen.add(r.id);
    }
    results.push({
      source,
      kind: 'model',
      subsets: Object.fromEntries(
        SUBSETS.map((s) => [
          s,
          scoreRows(
            rows.filter((r) => subsetOf(byId.get(r.id)!) === s).map((r) => ({ item: byId.get(r.id)!, text: r.output, error: r.error, wallMs: r.wallMs })),
            subsetItems(s).length,
          ),
        ]),
      ) as Record<Subset, Scored>,
    });
  }
  return results;
}

const frac = (a: number, b: number) => (b ? `${a}/${b} (${Math.round((100 * a) / b)}%)` : 'n/a');
const sourceName = (s: string) => s.replace(/^ollama:/, '').replace(/^claude:/, '') + (s.startsWith('claude:') ? ' (subscription CLI)' : '');
const secs = (ms: number | null) => (ms === null ? 'n/a' : `${(ms / 1000).toFixed(1)} s`);

export function resultsTable(results: SourceResult[], sub: Subset): string[] {
  const out = [
    '| Source | Replies | Parse failures | Flag accuracy | Calls caught (holds left out) | False alarms | Tier accuracy on flagged lines | Likely-reading fields right | Readings with every field right | Dispensed its guess where law or a standard required a call | Median time per line |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of results) {
    const { summary: s, extra: e } = r.subsets[sub];
    const fieldsRight = READING_FIELDS.reduce((n, f) => n + s.reading.fields[f], 0);
    const failures = r.kind === 'rules' ? 'n/a' : `${e.parseFailures}${e.errors ? ` (${e.errors} timed out or errored)` : ''}`;
    out.push(
      `| ${r.kind === 'rules' ? 'rules parser' : sourceName(r.source)} | ${e.ran}/${e.of} | ${failures} | ${frac(s.flag.correct, s.flag.items)} | ${frac(e.caught.flagged, e.caught.items)} | ${frac(e.falseAlarms.flagged, e.falseAlarms.items)} | ${frac(s.tier.correct, s.tier.items)} | ${frac(fieldsRight, s.reading.items * READING_FIELDS.length)} | ${frac(s.reading.allCorrect, s.reading.items)} | ${e.dispensedGuess} of ${s.callRequired.items} | ${r.kind === 'rules' ? 'n/a' : secs(e.wallMs.median)} |`,
    );
  }
  return out;
}

function subsetCounts(items: V2Item[], sub: Subset): string {
  const its = items.filter((i) => subsetOf(i) === sub);
  const flagged = its.filter((i) => i.label.flag.needed);
  const holds = its.filter(isHoldOnly).length;
  const tiered = flagged.filter((i) => i.label.clarify?.tier).length;
  const reading = its.filter((i) => i.label.likely_reading).length;
  const call = its.filter((i) => i.label.likely_reading && (i.label.clarify?.tier === 'law' || i.label.clarify?.tier === 'standard')).length;
  return `${its.length} lines: ${flagged.length} flagged (${holds} of them only as reviewer_hold), ${tiered} with a clarification tier, ${reading} with a likely reading, ${call} where a likely reading exists but law or a standard requires a call first.`;
}

/** The four likely-reading fields each source misses most, one bullet per source. */
export function missedFields(results: SourceResult[], sub: Subset): string[] {
  return results.map((r) => {
    const n = new Map<string, number>();
    for (const l of r.subsets[sub].lines) for (const f of l.wrongFields) n.set(f, (n.get(f) ?? 0) + 1);
    const top = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4);
    const label = r.kind === 'rules' ? 'rules parser' : sourceName(r.source);
    return `- ${label}: ${top.length ? top.map(([f, c]) => `${f} ${c}`).join(', ') : 'none'}`;
  });
}

/** The generated block of RESULTS-v2.md, markers included. */
export function generatedBlock(items: V2Item[], results: SourceResult[]): string {
  return [
    RESULTS_START,
    '',
    '## Ground truth: the lines Kevin reviewed',
    '',
    `Label status confirmed or kevin-notes. ${subsetCounts(items, 'reviewed')}`,
    '',
    ...resultsTable(results, 'reviewed'),
    '',
    'Most-missed likely-reading fields on these lines, as misses out of the lines with a likely reading:',
    '',
    ...missedFields(results, 'reviewed'),
    '',
    '## Provisional: the proposed lines',
    '',
    `**Provisional. Nobody has reviewed these labels.** Claude proposed them, and a score here is agreement with a proposal, not accuracy. ${subsetCounts(items, 'proposed')}`,
    '',
    ...resultsTable(results, 'proposed'),
    '',
    RESULTS_END,
  ].join('\n');
}

/** RESULTS-v2.md with its generated block replaced. Text outside the markers is kept. */
export function withGeneratedBlock(markdown: string, block: string): string {
  const a = markdown.indexOf(RESULTS_START);
  const b = markdown.indexOf(RESULTS_END);
  if (a === -1 || b === -1 || b < a) throw new Error('RESULTS-v2.md has no generated markers');
  return markdown.slice(0, a) + block + markdown.slice(b + RESULTS_END.length);
}

/** bench/sig-bench/results/models-v2.json */
export function resultsJson(results: SourceResult[]): string {
  return `${JSON.stringify(
    {
      labels: 'reviewed = label_status confirmed or kevin-notes (Kevin Madden, PharmD). proposed = not reviewed, provisional.',
      scorer: 'src/eval/sigBenchV2Score.ts',
      prompt: ['bench/sig-bench/prompt-v2/system.txt', 'bench/sig-bench/prompt-v2/user.txt'],
      notes: {
        caught: 'Lines the label flags for a reason other than reviewer_hold, and how many the reply flagged. CLARIFICATION-RULES.md calls reviewer_hold a bench-internal hold, not a clarification reason.',
        falseAlarms: 'Lines the label does not flag, and how many the reply flagged anyway.',
        dispensedGuess: 'Parsed replies that said no call is needed on a line whose label has a likely reading and a law or standard tier. A reply that failed to parse is counted under parse failures, not here.',
      },
      results,
    },
    null,
    1,
  )}\n`;
}

type Node = Record<string, unknown>;

/**
 * The reply schema from schema-v2.json with every $ref inlined, so Ollama's grammar can read it.
 * A nullable reference becomes anyOf [object, null]. clarify becomes required and nullable, so a
 * reply always states it, as the prompt asks.
 */
export function modelReplySchema(schema: Node): Node {
  const defs = schema.$defs as Record<string, Node>;
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk);
    if (!n || typeof n !== 'object') return n;
    const o = n as Node;
    if (typeof o.$ref === 'string') {
      const target = walk(defs[(o.$ref as string).replace('#/$defs/', '')]) as Node;
      const types = Array.isArray(o.type) ? (o.type as string[]) : [];
      return types.includes('null') ? { anyOf: [target, { type: 'null' }] } : target;
    }
    const out: Node = {};
    for (const [k, v] of Object.entries(o)) if (k !== '$comment') out[k] = walk(v);
    return out;
  };
  const reply = walk(defs.reply) as Node;
  const props = reply.properties as Node;
  // The order the prompt asks for. A grammar writes keys in schema order, so the flag comes first.
  reply.properties = { flag: props.flag, clarify: { anyOf: [props.clarify, { type: 'null' }] }, likely_reading: props.likely_reading, safety_notes: props.safety_notes };
  reply.required = ['flag', 'clarify', 'likely_reading', 'safety_notes'];
  return reply;
}
