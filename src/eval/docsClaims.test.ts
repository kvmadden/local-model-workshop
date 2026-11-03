/**
 * Guards the current documents against the overclaims the November 2026 review found. The
 * historical documents are hash-locked and corrected in docs/CORRECTIONS.md, so they are not
 * scanned here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const current = ['README.md', 'docs/DEVELOPMENT-RESULTS.md', 'eval/sig-extraction/README.md', 'eval/heldout/README.md', 'docs/FRESH-TEST-PROTOCOL.md'];
const read = (f: string) => readFileSync(f, 'utf8');

describe('current documents', () => {
  it('call both built-in sets development data and name no pick', () => {
    expect(read('README.md')).toMatch(/Both sets are development data/);
    expect(read('README.md')).toMatch(/No model is chosen/);
    expect(read('eval/heldout/README.md')).toMatch(/not a holdout/);
    expect(read('eval/sig-extraction/README.md')).toMatch(/Status: development data/);
  });

  it('do not present the template set as a locked test or the echo mock as proof against copying', () => {
    for (const f of current) {
      const text = read(f);
      expect(text, f).not.toMatch(/locked before any model (?:ran|saw)/i);
      expect(text, f).not.toMatch(/gives no credit for copying/i);
      expect(text, f).not.toMatch(/every model missed the 10-second limit in the original runs/i);
    }
  });

  it('use plain punctuation in prose: no semicolons or em dashes', () => {
    for (const f of [...current, 'docs/CORRECTIONS.md', 'docs/KEVIN-REVIEW.md', 'docs/README.md', 'docs/HOW-BUILT.md', 'eval/extraction-audit/V3.md']) {
      const prose = read(f).replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
      expect(prose.includes(';'), `${f} has a semicolon`).toBe(false);
      expect(prose.includes('—'), `${f} has an em dash`).toBe(false);
    }
  });
});
