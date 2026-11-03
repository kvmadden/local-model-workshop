# Corrections to the historical documents

The documents below are kept byte for byte, because `src/eval/extractionAuditVersions.test.ts` checks them against a hash manifest as part of the evidence record. Some of their claims are not supported by the evidence. This page corrects each one. Read the historical documents together with this page.

Each entry gives the place, what it says, and the correction with its evidence.

## docs/ORIGINAL-EVALUATION.md

1. **Line 15: "The OpenAI adapter sends an API key only if you type one into a step."**
   - The interface never had an API key field.
   - The step settings now show an endpoint field, and the adapter refuses any host that is not this machine unless code sets `allowRemote` and an API key (`src/engine/modelAdapter.ts`, `src/engine/modelAdapter.contract.test.ts`).
2. **Line 61: "Each model gets one untimed warm-up ... so load time is excluded."**
   - The first timed request was still the slowest for qwen3.8:27b in 6 of 6 runs, and for gemma4:31b in 2 of 6. Cases ran in file order, so this delay always landed on the first line.
   - The harness now makes two warm-ups, shuffles the order and reports the first request apart.
3. **Line 61: "drug by whole-word name match ... indication by whole-word match".**
   - The description is accurate, but the rule gave credit for copying the input line into the drug field (25 of 25 lines), for a different salt ("metoprolol succinate" for tartrate), and for a broader reason ("chest pain" for "pain").
   - Scorer v3 closes these (`src/eval/sigScoreV3.test.ts`). It gives the same verdicts on every saved reply.
4. **Line 91: "Decision rubric. Fixed before these runs."**
   - This cannot be checked. The first public commit (`9f47fec`, 2026-10-30) already contains the runs.
   - The split-format rubric, prompt and labels were written after the first-format runs on the same 25 lines, which makes those lines development data.
   - Only the 12-line template set has a verifiable freeze before its runs (`1b528e3`).
5. **Line 100: "wins the tie-break: it is 1.2 GB smaller on disk and had the lower p50 in both runs."**
   - Disk size alone decides the tie-break. p50 was never reached.
   - The same document calls the timing unfair, so p50 should not support the pick.
   - Disk size is not memory use, and the harness did not record it.
6. **Line 103: "If the re-timing rules out the other two, it is the next choice."**
   - Under the stated correctness gate, gpt-oss:20b is not eligible, so the gate's answer would be "no eligible model".
   - Under the audit protocol's rule for "at bedtime as needed", gpt-oss:20b is the only model that passes the gate (`src/eval/decision.test.ts`).
7. **Line 110: "... including a case proving it gives no credit to an echo of the prompt."**
   - The echo scores zero because it is not JSON, so the scorer never sees its content. A JSON reply that copied the line earned drug credit under the v2 scorer.
   - The copy control (`eval/results/2026-11-03-baselines-dev25`) is the real test, and it scores 0 under v3.
8. **Line 111: "Twenty-five lines ... are enough to separate models."**
   - A rules parser also gets every field right on all 25 lines.
   - The exact 95% interval for 25/25 is 86.3 to 100%, and for 24/25 it is 79.6 to 99.9%.
   - The one line that separates the models is a label convention.
9. **Line 109: "A regression in template resolution or the adapter shows up as an accuracy drop."**
   - Only on the path the eval uses: one step with one placeholder.
   - Step-name collisions, swallowed placeholders, missing deadlines and timing before the reply body was read would not have lowered a score. Each has its own test now.
10. **Line 155: "All data in this repository ... is fictional or synthetic."**
    - The extraction audit corpus is real public openFDA label text. It holds no patient data.

## docs/EVALUATION.md

1. **Line 15 onward: "Frozen holdout protocol" and "a narrow holdout".**
   - The 12 lines are development data, not a holdout.
   - They are six templates taken from the 25 development lines, filled in twice with made-up names and four strengths. Two of the six are the lines that decided the ranking.
   - See [eval/heldout/README.md](../eval/heldout/README.md).
2. **Line 19: "The test checks exact reproduction, disjoint inputs and internally consistent labels."**
   - "Disjoint" meant only that no line is the same string as a development line.
   - The label check scored each label against itself, which always passes.
3. **Line 33: "No model passed every gate."**
   - This is true of the two split-format runs on the 25 lines.
   - In the first-format runs, gemma4:31b and qwen3.8:27b met the 10-second budget in run 1, and all three met it in run 2 (load 74 to 154).
   - In the 12-line split-format run, gpt-oss:20b (7.7 s) and gemma4:31b (8.5 s) met it, and qwen3.8:27b (12.5 s, its first request) did not.

## docs/RESULTS.md

1. **The "v1 before / v2 after" table.**
   - The two columns score different fields. The first format also gave full credit for dropping as-needed use (gemma4:31b on "tid prn itching" was scored all correct).
   - The first-format numbers are a different target, not a "before".
2. **"Frozen holdout 12".**
   - Development data, as above.

## docs/VERIFICATION.md

1. **Line 11: "`1b528e3` commits the seed, generator, frozen labels and freeze tests before any new model inference."**
   - Verified. The commit is dated 2026-10-31 and the runs are dated 2026-11-01. It is reachable on the branch `grok/local-model-workshop-showcase`.

## Run folders

- `eval/results/heldout-v1` and `heldout-v2` carry the dataset name "heldout-seed-20261031". The names stay because the folders are locked evidence. The set is development data.
- The first-format `summary.json` files report timing and as-needed counts of 0. Those were placeholders for fields the first format did not score. New runs omit them.

## Claims on the public case page

Corrections for kvmadden.com are handled outside this repository. The same evidence applies, and the page should follow this one.
