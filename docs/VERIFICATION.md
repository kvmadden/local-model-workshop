# Showcase verification

## Scope and provenance

Base: `2b830f6` from `origin/main`. Work uses the isolated dispatcher-created worktree from the named local-model-workshop clone. No open repository PR covered this work at discovery or the pre-push recheck. The queued showcase job is this run. No work ledger row was changed.

Repository inventory and searches covered source, evaluation scripts, the schema archive and README. There are no nested AGENTS.md, CLAUDE.md, CANONICAL.md or FACTS.md in this repository. Estate brief and recent-run checks found the assigned showcase and separate portfolio-site jobs, not another owner implementing this repository change.

The dispatcher storage plan resolves evidence to `/Volumes/HubData/evidence`. This run's logs and screenshots are under `/Volumes/HubData/evidence/local-model-workshop-showcase`. Storage-plan receipt: `storage-plan-local-model-workshop-showcase-bbdc6306-576b-4fac-aef4-58cf1eb0be8b.json`.

`1b528e3` commits the seed, generator, frozen labels and freeze tests before any new model inference. No model, prompt, schema or scorer rule was tuned from heldout output. The original 25 cases, gold, prompts and all four historical run directories have zero diff from the base. The original README is preserved in ORIGINAL-EVALUATION.md.

## RED then GREEN

- `npx vitest run src/eval/holdout.test.ts` exited 1 before the generator and freeze existed. Failures were the missing generator and frozen file.
- The same command passed after generation. It checks byte-for-byte seeded reproduction, 12 disjoint inputs and self-consistent v2 gold.
- `npx playwright test e2e/showcase.spec.ts --workers=1` exited 1 on the base editor because `getByRole('button', { name: 'Use light theme' })` found no element. The saved screenshot shows the dark builder.
- The first browser attempt could not launch because Chromium was missing. `npx playwright install chromium` installed the prerequisite. That prerequisite failure is separate from the later failing assertion.
- `CAPTURE_SHOWCASE=1 npx playwright test e2e/showcase.spec.ts --config showcase.playwright.config.ts --workers=1` passed with a visible browser. At 1440x900, 430x932 and 390x844, the test switches theme and runs the mock flow with Enter, checks completion, checks page overflow and checks the Run Flow and Add Step targets are at least 44 by 44 CSS pixels.
- Screenshots use fictional text and the offline mock. Full-page PNGs retain the editor output below the initial viewport. Each was visually inspected. The inspector header received a small spacing fix after phone inspection.

The legacy scorer also reproduces every archived v1 case verdict. It reuses existing name, dose and frequency normalization, without inventing timing or PRN coverage for v1.

## Gate comparison

Toolchain: Node 24.14.1, npm 11.11.0, package-lock.json unchanged. The detached control at `/tmp/local-model-workshop-showcase-control` points to untouched `origin/main` and shares the exact installed node_modules through a symlink. Both browser suites use the existing hermetic synthetic fixtures and the same two-worker command. Live heldout inference is separate from browser fixtures.

| Command | Untouched main | Candidate |
|---|---|---|
| `npm test` | Exit 0, 312 tests in 23 files | Exit 0, 315 tests in 25 files |
| `npm run build` | Exit 0 | Exit 0 |
| `npm run test:e2e -- --workers=2` | First run exit 1, 66 passed and one timeout. Full recheck exit 0, 67 passed | Exit 0, 69 passed |
| `npx vitest run src/eval/holdout.test.ts src/eval/legacyScore.test.ts` | New tests, RED evidence above | Exit 0, 3 tests |
| `git diff --check` | n/a | Exit 0 |

The baseline browser failure is `e2e/engine-modes.spec.ts:326`, “a live run never leaves the demo banner or a null model tag on screen”. It exceeded the unchanged 30-second test timeout while opening the playground and waiting for its output container. The trace and error context are preserved in the evidence home. That first completed control run was red. A full recheck with the identical command and unchanged source then exited 0 with 67 passes. The timeout did not recur. Both run logs are retained, so the recheck does not erase the earlier failure. Earlier browser attempts during prerequisite installation were superseded by these completed runs.

## Reproduction

```bash
node scripts/generate-holdout.mjs
npm run eval -- --heldout --schema-v1 --out eval/results/new-v1
npm run eval -- --heldout --out eval/results/new-v2
node scripts/render-results.mjs
CAPTURE_SHOWCASE=1 npx playwright test e2e/showcase.spec.ts --config showcase.playwright.config.ts --workers=1
```

The chart, table and misses are generated from committed evidence. New eval output directories protect the original runs. Screenshot writes require CAPTURE_SHOWCASE=1, so normal tests do not overwrite portfolio media. The visible capture config uses port 5177 so it can run without replacing another local dev server. The ordinary full gate uses the unchanged port 5176 configuration.

The sample is small, template-based and synthetic. The new gold is not independently pharmacist reviewed. Historical and new timing were collected on a shared, loaded Mac. There is no hosted cost benchmark, quiet-machine timing validation or clinical validation.

New live evaluations both exited 0. On the frozen holdout, v1 and v2 all-fields counts respectively were GPT 12/12 and 10/12, Gemma 12/12 and 12/12, and Qwen 9/12 and 12/12. All model replies parsed in both schemas. `--heldout --schema-v1 --mock-only` and `--heldout --mock-only` also exited 0 after the loader refactor, using evidence-home output directories. `node scripts/render-results.mjs` exited 0.

Freeze SHA-256: `dfc3d06a33a8714f258215528833e9feb64fcc81be115799e80707e67f433a00`. No candidate-only failures remain. Browser prerequisites were installed normally, with no changes to hooks, assertions or timeout limits.
