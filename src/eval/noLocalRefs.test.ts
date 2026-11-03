/**
 * Prose that ships with the repo names no place on the author's machine and no local server
 * address. A reader needs the step, not the address. Prose is every README*.md, SECURITY.md and
 * CONTRIBUTING.md, and the .md, .txt, .json and .py files under docs/. Code, config and tests may
 * still use loopback addresses.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Vitest runs from the repo root, as the other document tests assume.
const ROOT = process.cwd();
const PROSE = /(?:^|\/)(?:README[^/]*\.md|SECURITY\.md|CONTRIBUTING\.md)$|^docs\/.*\.(?:md|txt|json|py)$/i;

const PATTERNS: [string, RegExp][] = [
  ['a home folder', /(?<![\w-])\/Users\//],
  ['a mounted volume', /(?<![\w-])\/Volumes\//],
  ['a private system folder', /\/private\/(?:tmp|var)\b/],
  ['a temporary folder path', /(?<![\w.~-])\/tmp\//],
  ['a folder under ~/dev', /(?:~|\$HOME|\$\{HOME\})\/dev(?![\w-])/],
  ['a loopback host name', /localhost/i],
  ['a loopback or wildcard address', /(?<![\d.])(?:127\.0\.0\.1|0\.0\.0\.0)(?!\d)|\[::1\]/],
];

// Names from the author's own setup, kept as SHA-256 digests so this file does not spell them
// out: a disk, a variable prefix, a workspace and its nickname. Each word is checked whole and in
// its underscore or hyphen parts, and each pair of words is checked too.
const PRIVATE = new Set([
  '281fc54d9f4eac1d86906d272731264bd7787c8e65e52f2f70fe80d9c21e8b90',
  'e649cd1b32b872ff33594130b5c30c5976667e936a9e088e9b372b557ad2ea69',
  'fe905daa8dedc9a2208ecd34757ed3522ef22b0c3ba475dd83629597ca65b4f3',
  'aa6cc0f6e747162d0f7c7f6964af3ca55fdcee0d24688d7b82ea426d9bfe44ae',
]);

// Lines allowed to keep a match, with the reason. Keep it short.
const ALLOWED: Record<string, number[]> = {
  // Historical records kept byte for byte: eval/extraction-audit/historical-hashes.json holds
  // their hashes and src/eval/extractionAuditVersions.test.ts checks them. Corrections to them
  // go in docs/CORRECTIONS.md.
  'docs/ORIGINAL-EVALUATION.md': [15, 29, 132, 147],
  'docs/VERIFICATION.md': [26],
};

const seen = new Map<string, string>();
const digest = (text: string): string => {
  let hex = seen.get(text);
  if (!hex) {
    hex = createHash('sha256').update(text).digest('hex');
    seen.set(text, hex);
  }
  return hex;
};

function parts(word: string): string[] {
  const marks = [...word.matchAll(/_/g)].map((m) => m.index ?? 0);
  const starts = [0, ...marks.map((i) => i + 1)];
  const ends = [...marks, word.length];
  const out: string[] = [];
  for (const s of starts) {
    for (const e of ends) {
      if (e <= s) continue;
      out.push(word.slice(s, e));
      if (e < word.length) out.push(word.slice(s, e + 1));
    }
  }
  return out;
}

function namesPrivate(line: string, names: Set<string> = PRIVATE): boolean {
  const words = line.toLowerCase().match(/[a-z0-9_-]+/g) ?? [];
  return words.some((word, i) =>
    parts(word.replace(/-/g, '_')).some((part) => names.has(digest(part))) ||
    (i > 0 && names.has(digest(`${words[i - 1]} ${word}`))));
}

const findings = (line: string): string[] => [
  ...PATTERNS.filter(([, pattern]) => pattern.test(line)).map(([what]) => what),
  ...(namesPrivate(line) ? ['a private name'] : []),
];

const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
const prose = [...new Set(listed.split('\0'))].filter((file) => PROSE.test(file) && existsSync(path.join(ROOT, file)));
const read = (file: string): string[] => readFileSync(path.join(ROOT, file), 'utf8').split('\n');

describe('READMEs and docs', () => {
  it('name no local path, private name or loopback address', () => {
    expect(prose).toContain('README.md');
    expect(prose.length, `the scan sees the prose (${prose.length} files)`).toBeGreaterThan(10);
    const hits: string[] = [];
    for (const file of prose) {
      read(file).forEach((line, i) => {
        if (ALLOWED[file]?.includes(i + 1)) return;
        for (const what of findings(line)) hits.push(`${file}:${i + 1}: ${what}`);
      });
    }
    for (const [file, numbers] of Object.entries(ALLOWED)) {
      const lines = read(file);
      for (const n of numbers) expect(findings(lines[n - 1] ?? '').length, `${file}:${n} no longer needs its allowlist entry`).toBeGreaterThan(0);
    }
    expect(hits, 'say what the reader does instead of giving the address, and write paths with placeholders such as <repo> or <control>').toEqual([]);
  });

  it('are checked by patterns that catch what they are for and leave ordinary text alone', () => {
    const caught = ['cd /Users/someone/x', 'file:///private/tmp/x', 'at ../../private/tmp/x', 'see ../Users/someone', 'clone at /tmp/x', 'see ~/dev/x',
      '/Volumes/Disk/x', 'open http://localhost:3000', '--bind 127.0.0.1.', 'listen on 0.0.0.0', 'http://[::1]:8080'];
    const passed = ['the /api/Users/7 route', 'src/tmp/cache', 'version 10.0.0.0', 'file://<control>/test/a.js', 'real estate', '~/development'];
    for (const line of caught) expect(findings(line).length, `caught: ${line}`).toBeGreaterThan(0);
    for (const line of passed) expect(findings(line), `left alone: ${line}`).toEqual([]);
    const decoy = new Set([digest('decoy_'), digest('a decoy')]);
    expect(namesPrivate('X_DECOY_PATH=1', decoy)).toBe(true);
    expect(namesPrivate('in a decoy folder', decoy)).toBe(true);
    expect(namesPrivate('decoys and decoying', decoy)).toBe(false);
  });
});
