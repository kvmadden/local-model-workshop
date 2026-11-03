/**
 * Writes labels v2 of the public label excerpts from labels v1 and the accepted change set.
 *
 *   npx vite-node scripts/audit-labels-v2.ts
 *
 * Labels v1 (eval/extraction-audit/public.json) is never written. If v2 already exists, the
 * script only checks that deriving it again gives the same bytes, and never overwrites it.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyLabelChanges, pythonStyleJson, type LabelChangeSet } from '../src/eval/auditLabels';
import type { AuditCase } from '../src/eval/extractionAudit';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const set = JSON.parse(readFileSync('eval/extraction-audit/public-v2-changes.json', 'utf8')) as LabelChangeSet;
const v1Text = readFileSync(set.base.path, 'utf8');
if (sha256(v1Text) !== set.base.sha256) throw new Error(`${set.base.path} does not match the hash the change set was written against`);

const v2Text = pythonStyleJson(applyLabelChanges(JSON.parse(v1Text) as AuditCase[], set));
if (existsSync(set.result.path)) {
  if (readFileSync(set.result.path, 'utf8') !== v2Text) throw new Error(`${set.result.path} exists and differs from a fresh derivation. It is never overwritten.`);
  process.stdout.write(`${set.result.path} matches a fresh derivation. sha256 ${sha256(v2Text)}\n`);
} else {
  writeFileSync(set.result.path, v2Text, { flag: 'wx' });
  process.stdout.write(`Wrote ${set.result.path}. sha256 ${sha256(v2Text)}\n`);
}
