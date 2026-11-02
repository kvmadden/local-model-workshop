# Extraction audit verification

Base: `2d3938eae610851a777916dfde70b187cbc77714`, fetched from origin/main on November 1, 2026. PR #1 is merged. No other open PR was returned. Its merged showcase work was left in place. Searches covered source, archived evaluation schemas and templates. This change owns the residual extraction audit and saved-run inspection only.

The worktree started clean on the base commit. No other edits were reverted. Full working evidence is kept in a local evidence home outside the repository. Portable selected logs are in [audit-evidence](audit-evidence).

## RED and GREEN

Before the scorer implementation, five contract tests ran against placeholders and all five failed. The first assertion expected precision 0.5 for one supported and one invented drug, but received 1. Other failures covered dose and PRN or schedule, empty controls, crossed source splits and metadata leakage. The [RED log](audit-evidence/red-assertions.log) preserves the actual assertions.

Exact initial command: `npx vitest run src/eval/extractionAudit.test.ts > <evidence home>/red-assertions.log 2>&1`, followed by `tail -60` on the log. The shell wrapper returned 0 because its final command printed the log. That was a failed suite, not a green run. The first missing-module run also failed before the placeholders were supplied.

The five initial contract tests then passed. Additional tests verify public snapshot hashes and spans, review status, source IDs, exact offline report and gallery reproduction with fetch disabled, actual adapter request invariance, inference/key isolation, every historical evaluation byte, saved inspector reproduction and incomplete acquisition inspection. The [candidate unit log](audit-evidence/candidate-unit.log) records the final suite.

One intermediate candidate unit run failed because the test adapter implemented `execute` rather than the existing `executePrompt` interface. The fixture was corrected. One intermediate full browser gate had 70 passes and one failure in the new phone audit test because the existing catalog detector overflowed the benchmark page. Benchmark Studio now opens its inspector directly and uses the existing theme controls. The original landing and other tabs retain their existing content. These intermediate runs were not called green.

## Untouched main control

A fresh local clone outside the estate checked out the exact base commit in detached mode. The clone had `MFW_UMBRELLA_ROOT` and `OPERATOR_ECOSYSTEM_ROOT` removed from its environment. It used `npm ci` and the unchanged lockfile. The temporary clone was deleted in a Python `finally` block after preserving logs.

Toolchain for both trees: Node v24.14.1, npm 11.11.0, Vitest 3.2.6, TypeScript 5.9.3, Vite 6.4.3 and Playwright 1.62.1. Candidate dependency versions were checked with `npm ls --depth=0`. Existing hermetic browser fixtures were identical on both trees.

| Exact command | Main control exit | Candidate exit |
| --- | --- | --- |
| `npm ci` | 0 | Existing lockfile-installed dependencies, verified by npm ls |
| `npm test` | 0, 315 tests | 0, 328 tests |
| `npm run build` | 0 | 0 |
| `npx playwright test --workers=2` | 0, 69 tests | 0, 72 tests |

The candidate adds audit cases and tests. There were no baseline unit, build or browser failures. Earlier candidate-only failures are described above. No hooks were disabled or weakened.

## Acquisition and remaining limits

The first frozen acquisition attempted two randomized passes through the named installed models, but every request returned HTTP 405 because the new runner supplied the endpoint root. Those outputs, errors and freeze are preserved as acquisition failures. A corrected runner and a new freeze use the actual generate route. The corrected shared-machine exploration was stopped at 23/42 Qwen requests in pass one, with all completed replies retained. The host load averaged around 50 and could not meet the quiet-machine prerequisite. This is not two completed corrected timing passes.

The runnable acquisition command is provided. Two complete controlled passes and new gold review remain pending. No new model score, ranking, quiet-machine result or clinical certification is claimed. All aggregate scores for incomplete acquisition are unmeasured. Offline controls are draft diagnostics with per-task denominators and document bootstrap intervals.

Scoring and inspection are tested with a throwing fetch implementation. All complete control reports reproduce the entire error list and gallery. The partial inspection also reproduces every acquired error without treating unavailable requests as predictions. The historical hash manifest verifies every original evaluation file and original published result unchanged.

## Visual evidence

The saved inspector reuses current Slate and Indigo tokens and the existing theme system. Visible browser captures cover 1440x900, 430x932 and 390x844 in light and dark. Tests use keyboard navigation, require 44 pixel controls and assert no document overflow. The GIF follows the actual saved input, selected case and span details. The portable media are under `docs/media/audit-*`. The inspector labels controls and incomplete acquisition explicitly and links source rights and complete error artifacts.

The offline CLI was also executed under macOS `sandbox-exec` with `(version 1)(allow default)(deny network*)`. Both `node node_modules/.bin/vite-node scripts/audit-report.ts --write` and `node node_modules/.bin/vite-node scripts/audit-rescore.ts --run eval/extraction-audit/local-20261101` exited 0 with networking denied. This supplements the fetch-disabled tests.

Media capture command: `CAPTURE_AUDIT=1 npx playwright test e2e/extraction-audit.spec.ts --config showcase.playwright.config.ts --workers=1`, exit 0, two tests. All six final PNGs were visually inspected and their dimensions verified as 1440x900, 430x932 and 390x844. The GIF has three 1440x900 frames across six seconds. A temporary Pillow environment assembled the captured frames, then was removed. Media and source frames are preserved in the evidence home.

Final candidate gate: `npm test` exit 0 with 328 tests, `npm run build` exit 0, and `npx playwright test --workers=2` exit 0 with 72 tests. `git diff --check` exited 0. The final candidate has no remaining unit, build or browser failure relative to the untouched main control.
