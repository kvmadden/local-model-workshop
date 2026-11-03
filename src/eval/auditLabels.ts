/**
 * Labels v2 for the public label excerpts of the extraction audit.
 *
 * eval/extraction-audit/public.json (labels v1) is evidence and never changes. Labels v2 is v1
 * with the 19 corrections listed in eval/extraction-audit/public-v2-changes.json applied, and
 * nothing else. Claude proposed them, and Kevin Madden, PharmD, accepted all 19 as one batch on
 * 2026-11-03. No pharmacist has checked them one by one yet, so v2 is still a draft.
 *
 * Pure functions, no I/O. scripts/audit-labels-v2.ts writes the file, and
 * src/eval/auditLabels.test.ts derives it again and compares it byte for byte.
 */
import { normalize, type AuditCase, type Entity } from './extractionAudit';

export interface LabelAddition { task: string; text: string; after?: string }
export interface LabelChange {
  n: number;
  id: string;
  proposal: string;
  decision?: string;
  remove: Array<{ task: string; value: string }>;
  add: LabelAddition[];
  note?: string;
}
export interface LabelChangeSet {
  base: { path: string; sha256: string };
  result: { path: string; sha256: string };
  proposedBy: string;
  acceptedBy: string;
  acceptedOn: string;
  acceptance: string;
  changes: LabelChange[];
}

/** JSON the way Python's json.dumps(indent=2) writes it, which is how labels v1 was written. */
export function pythonStyleJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`) + '\n';
}

const TASK_ORDER = ['drug', 'dose', 'schedule', 'timing', 'prn', 'indication'];

/** The entity for an added literal mention: its first occurrence, after the anchor when one is given. */
export function locateAddition(input: string, add: LabelAddition): Entity {
  let from = 0;
  if (add.after !== undefined) {
    const anchor = input.indexOf(add.after);
    if (anchor === -1) throw new Error(`anchor "${add.after}" is not in the input`);
    from = anchor + add.after.length;
  }
  const start = input.indexOf(add.text, from);
  if (start === -1) throw new Error(`"${add.text}" is not in the input`);
  return { task: add.task, value: normalize(add.text), spans: [{ start, end: start + add.text.length }] };
}

/** The correction note written into each changed case's review record. */
export function correctionNote(set: LabelChangeSet, changes: LabelChange[]): string {
  const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);
  const what = changes.map((c) => `Change ${c.n}: ${sentence(c.decision ?? c.proposal)}${c.note ? ` ${sentence(c.note)}` : ''}`).join(' ');
  return `Labels v2, ${set.acceptedOn}: ${what} Proposed by Claude. Accepted by ${set.acceptedBy}, as part of a batch of ${set.changes.length}. Not yet checked one by one by a pharmacist.`;
}

/**
 * Applies the change set to labels v1. Throws when a removal names an entity v1 does not have,
 * when an addition is not in the text, or when the result would hold the same task and value twice.
 */
export function applyLabelChanges(v1: AuditCase[], set: LabelChangeSet): AuditCase[] {
  const byCase = new Map<string, LabelChange[]>();
  for (const change of set.changes) byCase.set(change.id, [...(byCase.get(change.id) ?? []), change]);
  for (const id of byCase.keys()) if (!v1.some((c) => c.id === id)) throw new Error(`no case ${id} in labels v1`);

  return v1.map((original) => {
    const changes = byCase.get(original.id);
    if (!changes) return original;
    let gold: Entity[] = original.gold.map((e) => ({ ...e }));
    for (const change of changes) {
      for (const r of change.remove) {
        const at = gold.findIndex((e) => e.task === r.task && normalize(e.value) === normalize(r.value));
        if (at === -1) throw new Error(`${original.id}: no ${r.task} "${r.value}" to remove`);
        gold.splice(at, 1);
      }
      for (const add of change.add) {
        const entity = locateAddition(original.input, add);
        // Keep entities grouped by task, in the order v1 uses.
        const lastSameTask = gold.map((e) => e.task).lastIndexOf(add.task);
        const insertAt = lastSameTask !== -1
          ? lastSameTask + 1
          : gold.findIndex((e) => TASK_ORDER.indexOf(e.task) > TASK_ORDER.indexOf(add.task));
        if (insertAt === -1) gold = [...gold, entity];
        else gold.splice(insertAt, 0, entity);
      }
    }
    const identities = gold.map((e) => `${e.task}:${normalize(e.value)}`);
    if (new Set(identities).size !== identities.length) throw new Error(`${original.id}: the same task and value twice`);
    return { ...original, review: { ...original.review, correction: correctionNote(set, changes) }, gold };
  });
}
