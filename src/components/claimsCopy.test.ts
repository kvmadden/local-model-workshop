/**
 * The workshop's own interface copy must not promise more than the code does. Running a model on
 * this Mac does not by itself make anything air-gapped, private or compliant, and no savings
 * figure was ever measured. Sample document text in src/data is fiction and is not scanned.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

const BANNED: Array<[RegExp, string]> = [
  [/air-?gapped/i, 'no part of the app verifies network isolation'],
  [/100%\s*(?:private|offline|on-device|air)/i, 'an absolute privacy promise'],
  [/zero cloud network/i, 'an absolute network promise'],
  [/without exposing sensitive content/i, 'a privacy promise attached to demo output'],
  [/\$\s?\d[\d,]*(?:\/month|\s+in annual)/i, 'an invented savings figure'],
];

describe('interface copy', () => {
  it('makes no absolute privacy promise and no invented savings claim', () => {
    const hits: string[] = [];
    for (const file of files('src/components')) {
      const text = readFileSync(file, 'utf8');
      for (const [pattern, why] of BANNED) {
        const m = text.match(pattern);
        if (m) hits.push(`${file}: "${m[0]}" (${why})`);
      }
    }
    expect(hits).toEqual([]);
  });
});
