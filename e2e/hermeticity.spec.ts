/**
 * hermeticity.spec.ts — keeps the next spec file from quietly reintroducing
 * the bug `fixtures.ts` was written to kill.
 *
 * Nothing about `import { test } from '@playwright/test'` looks wrong. It is
 * what every Playwright doc shows, it is what all four of these spec files did
 * until now, and a spec written that way passes review and passes CI. It just
 * asserts a different thing depending on whether the author had Ollama running
 * — which is how workshop.spec T3-02 and T3-04 came to fail on one machine and pass
 * on another with no code change between them.
 *
 * A comment asking people to remember is not a guard. This is: the runner may
 * only be imported from `./fixtures`, where every engine request is answered by
 * the test.
 *
 * Type-only imports from '@playwright/test' stay allowed — `import type
 * { Page }` cannot carry a runner into the file, and forbidding it would push
 * specs toward untyped helpers to satisfy a lint rule, which is worse code for
 * no hermeticity gain.
 *
 * This test uses no browser: it never destructures `page`, so Playwright never
 * launches one.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { test, expect } from './fixtures';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));

/** The one file allowed to extend the base runner — it is the seam itself. */
const FIXTURE_FILE = 'fixtures.ts';

const specFiles = readdirSync(E2E_DIR)
  .filter((name) => name.endsWith('.spec.ts'))
  .sort();

/**
 * One import statement, parsed rather than pattern-sniffed.
 *
 * `[^;]` is doing real work: it spans newlines, so a multi-line named import
 * is one match, but it cannot cross the `;` that ends a statement. An earlier
 * revision used `[\s\S]*?`, which happily started at one import and finished at
 * a LATER statement's specifier — it flagged `engine-modes.spec.ts` for a
 * type-only import that was three lines further down.
 *
 * Comments are stripped first, because this file necessarily contains the very
 * strings it is looking for, and the first revision flagged itself.
 */
const IMPORT_STATEMENT = /^import\s+([^;]*?)\bfrom\s+['"]([^'"]+)['"]/gm;

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** Import statements that pull a VALUE (not just a type) out of the runner. */
const runnerValueImports = (source: string) => {
  const found: string[] = [];
  for (const [statement, clause, specifier] of stripComments(source).matchAll(IMPORT_STATEMENT)) {
    if (specifier !== '@playwright/test') continue;
    if (clause.trimStart().startsWith('type')) continue;
    found.push(statement.replace(/\s+/g, ' ').trim());
  }
  return found;
};

test.describe('e2e suite hermeticity', () => {
  test('the guard can see the spec files it claims to check', () => {
    // A zero-length sweep would report "all clear" forever. Prove the detector
    // has input before trusting its verdict.
    expect(specFiles.length).toBeGreaterThan(1);
    expect(specFiles).toContain('workshop.spec.ts');
  });

  for (const file of specFiles) {
    test(`${file} takes its runner from ./fixtures, not @playwright/test`, () => {
      const source = readFileSync(join(E2E_DIR, file), 'utf8');

      const offenders = runnerValueImports(source);
      expect(
        offenders,
        `${file} imports the runner directly, so its engine state is whatever ` +
          `is running on the machine. Import { test, expect } from './fixtures' ` +
          `and select a state with test.use({ engineMode: … }).`
      ).toEqual([]);

      expect(
        source.includes(`from './${FIXTURE_FILE.replace('.ts', '')}'`),
        `${file} never imports ./fixtures`
      ).toBe(true);
    });
  }
});
