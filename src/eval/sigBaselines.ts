/**
 * Baselines for the medication-instruction extraction eval. None of them is a model.
 *
 * - rules: a deterministic parser for the six fields, written from the split-format prompt's own
 *   rules. It was written after its author had read the 25 development lines and the 12 template
 *   lines, so on those sets it measures how regular they are, not what rules would do on real
 *   text. It is frozen so that nobody can retune it after seeing a later set. Frozen does not mean
 *   strong or fair: it knows the patterns of those lines plus a few general rules (a digit inside
 *   a drug name, a schedule word after "not", either rule for "at bedtime as needed"), and it will
 *   miss much of what other lines say. It reports the words it could not read.
 * - constant: the same answer for every line (the most common label in each field).
 * - copy: copies the whole input line into every text field. It checks that the scorer gives no
 *   credit for copying.
 *
 * The rules parser accounts for the whole line. Words it did not use are returned in `unread`,
 * so a line it could not fully read is reported as needing review instead of being treated as if
 * the missing information were absent.
 */
import type { SigPrediction } from './sigScore';
import { wordTokens } from './sigScoreV3';

/** The two readings of "at bedtime as needed". The gold of the development sets uses once-daily. */
export interface RulesOptions {
  bedtimeAsNeeded?: 'once-daily' | 'no-schedule';
}

export interface RulesResult {
  prediction: SigPrediction;
  /** Words of the input that no rule used. Non-empty means the line needs review. */
  unread: string[];
}

const QUANTITY_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };

/** Small words that carry no instruction content on their own. */
const FILLER: ReadonlySet<string> = new Set(['a', 'an', 'the', 'of', 'by', 'to', 'on', 'in', 'each', 'and', 'for', 'with', 'as']);

const FREQUENCY_RULES: Array<[RegExp, string]> = [
  [/\bonce\s+weekly\b/i, 'once_weekly'],
  [/\b(?:four\s+times\s+daily|qid)\b/i, 'four_times_daily'],
  [/\b(?:three\s+times\s+daily|tid)\b/i, 'three_times_daily'],
  [/\b(?:twice\s+daily|twice\s+a\s+day|bid)\b/i, 'twice_daily'],
  [/\b(?:every\s+(4|6|8|12)\s+hours|q(4|6|8|12)h)\b/i, 'interval'],
  [/\b(?:once\s+daily|once\s+a\s+day|daily|qd|qam|qhs|every\s+morning|every\s+evening|at\s+bedtime)\b/i, 'once_daily'],
];

/** True when one of the three words before `index` negates what follows ("do not take qid"). */
function negatedAt(line: string, index: number): boolean {
  const before = line.slice(0, index).toLowerCase().replace(/[^a-z']+/g, ' ').trim().split(' ').slice(-3);
  return before.some((w) => ['not', 'no', 'never', "don't", 'dont', 'avoid', 'stop'].includes(w));
}

/** The first match of `pattern` in `line` that is not negated, or null. */
function firstUnnegated(line: string, pattern: RegExp): RegExpMatchArray | null {
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  for (const m of line.matchAll(global)) if (!negatedAt(line, m.index ?? 0)) return m;
  return null;
}

const TIMING_RULES: Array<[RegExp, string]> = [
  [/\b(?:qam|every\s+morning)\b/i, 'morning'],
  [/\b(?:qhs|at\s+bedtime)\b/i, 'bedtime'],
  [/\bevery\s+evening\b/i, 'evening'],
  [/\bwith\s+meals\b/i, 'with_meals'],
  [/\bbefore\s+meals\b/i, 'before_meals'],
  [/\bafter\s+meals\b/i, 'after_meals'],
];

/** Words the rules understand without assigning them to a field: verbs, routes, forms. */
const KNOWN_WORDS: ReadonlySet<string> = new Set([
  'take', 'give', 'inhale', 'inject', 'place', 'dissolve', 'apply', 'use',
  'mouth', 'po', 'oral', 'orally', 'subcutaneously', 'subcut', 'sublingual', 'under', 'tongue', 'nostril', 'nasal',
  'tab', 'tabs', 'tablet', 'tablets', 'cap', 'caps', 'capsule', 'capsules', 'puff', 'puffs', 'spray', 'sprays',
  'solution', 'suspension', 'odt', 'hfa', 'dr', 'actuation', 'needed', 'prn',
]);

export function rulesSig(line: string, options: RulesOptions = {}): RulesResult {
  const used: string[] = [];
  const mark = (text: string) => used.push(...wordTokens(text));

  // The drug is everything before the first word that starts with a digit, so a digit inside a
  // name stays in it ("Vitamin D3 1000 units").
  const firstNumber = line.search(/(?:^|[\s(])\d/);
  const drug = (firstNumber === -1 ? line : line.slice(0, firstNumber)).replace(/[,:\-]+\s*$/, '').trim();
  mark(drug);

  const strength = line.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|units|g)\b(?:\s*\/\s*(\d+(?:\.\d+)?)?\s*(ml|actuation|spray))?/i);
  let value = strength ? Number(strength[1]) : NaN;
  let unit = strength ? strength[2].toLowerCase() : 'mg';
  if (strength) mark(strength[0]);
  const rest = strength ? line.slice(strength.index! + strength[0].length) : line;

  const volume = rest.match(/\b(?:give|take)\s+(\d+(?:\.\d+)?)\s*ml\b/i);
  const injected = rest.match(/\binject\s+(\d+(?:\.\d+)?)\s*units\b/i);
  if (strength?.[4]?.toLowerCase() === 'ml' && volume) {
    value = (value / Number(strength[3] ?? 1)) * Number(volume[1]);
    mark(volume[0]);
  } else if (injected) {
    value = Number(injected[1]);
    unit = 'units';
    mark(injected[0]);
  } else {
    const qty = rest.match(/\b(one-half|half\s+a|half|\d+\/\d+|\d+(?:\.\d+)?|one|two|three|four)\s*(?:tablets?|tabs?|caps?|capsules?|puffs?|sprays?)\b/i)
      ?? rest.match(/,\s*(\d+)\s*(?:tab|cap)\b/i)
      ?? rest.match(/\b(\d+)\s+po\b/i);
    let multiplier = 1;
    if (qty) {
      const q = qty[1].toLowerCase();
      if (q.includes('/')) {
        const [a, b] = q.split('/').map(Number);
        multiplier = a / b;
      } else if (q.startsWith('half') || q === 'one-half') multiplier = 0.5;
      else multiplier = QUANTITY_WORDS[q] ?? Number(q);
      mark(qty[0]);
    }
    value *= multiplier;
    if (/\bin\s+each\s+nostril\b/i.test(rest)) {
      value *= 2;
      mark('in each nostril');
    }
  }

  let frequency: string | null = null;
  let scheduleIsBedtimeOnly = false;
  for (const [pattern, label] of FREQUENCY_RULES) {
    const m = firstUnnegated(line, pattern);
    if (m) {
      frequency = label === 'interval' ? `every_${m[1] ?? m[2]}_hours` : label;
      scheduleIsBedtimeOnly = /^(?:at\s+bedtime|qhs)$/i.test(m[0]);
      mark(m[0]);
      break;
    }
  }
  let timing: string | null = null;
  for (const [pattern, label] of TIMING_RULES) {
    const m = firstUnnegated(line, pattern);
    if (m) {
      timing = label;
      mark(m[0]);
      break;
    }
  }
  const prnPhrase = line.match(/\b(?:as\s+needed|prn)\b/i);
  const prn = prnPhrase !== null;
  if (prnPhrase) mark(prnPhrase[0]);
  // Under the audit protocol's rule, a bedtime anchor on an as-needed line is not a schedule.
  if (prn && scheduleIsBedtimeOnly && options.bedtimeAsNeeded === 'no-schedule') frequency = null;
  const reason = line.match(/\b(?:as\s+needed\s+for|prn)\s+([a-z ]+?)(?:,|\.|$)/i);
  const prnIndication = prn && reason ? reason[1].trim().toLowerCase() : null;
  if (prnIndication) mark(prnIndication);

  const usedCounts = new Map<string, number>();
  for (const t of used) usedCounts.set(t, (usedCounts.get(t) ?? 0) + 1);
  const unread: string[] = [];
  for (const t of wordTokens(line)) {
    const left = usedCounts.get(t) ?? 0;
    if (left > 0) {
      usedCounts.set(t, left - 1);
      continue;
    }
    if (FILLER.has(t) || KNOWN_WORDS.has(t)) continue;
    unread.push(t);
  }

  return {
    prediction: {
      drug,
      dose_per_administration: { value: Math.round(value * 1000) / 1000, unit },
      frequency,
      timing,
      prn,
      prn_indication: prnIndication,
    },
    unread,
  };
}

/** The same answer for every line: the most common label in each field of the 25 development lines. */
export function constantSig(): SigPrediction {
  return { drug: '', dose_per_administration: { value: 0, unit: 'mg' }, frequency: 'once_daily', timing: null, prn: false, prn_indication: null };
}

/** Copies the input line into every text field. A scorer that gives this credit is broken. */
export function copySig(line: string): SigPrediction {
  return { drug: line, dose_per_administration: { value: 0, unit: 'mg' }, frequency: null, timing: null, prn: false, prn_indication: line };
}

export const BASELINES = ['rules', 'constant', 'copy'] as const;
export type BaselineName = (typeof BASELINES)[number];

export function runBaseline(name: BaselineName, line: string, options: RulesOptions = {}): { text: string; unread: string[] } {
  if (name === 'rules') {
    const r = rulesSig(line, options);
    return { text: JSON.stringify(r.prediction), unread: r.unread };
  }
  if (name === 'constant') return { text: JSON.stringify(constantSig()), unread: [] };
  return { text: JSON.stringify(copySig(line)), unread: [] };
}
