# Fresh blind test set: pre-registered protocol

Pre-registered on 2026-11-03, before any item of the set was written. This file fixes what the set must contain, how it is labeled, how it is locked and how the decision is made. Nobody runs a model on the set until it is locked. Any change to this file after the set is unsealed must be reported as a protocol change.

## Why a fresh set is needed

Both sets in the repository are development data.

- The 25 lines ([`eval/sig-extraction/cases.jsonl`](../eval/sig-extraction/README.md)) are the lines the split format, its prompt and its labels were revised on, after the first-format runs.
- The 12 template lines ([`eval/heldout/frozen.json`](../eval/heldout/README.md)) are six templates copied from those 25 lines, each filled in twice.
- A short rules parser gets every field right on all 25 and all 12 lines. These sets cannot rank models, cannot show value over rules, and cannot support a headline number.

## Who writes and labels it

- **Writers.** Lines are written by at least two model families other than Claude, which built the scorer, the rules parser and the prompts. Writers must not open `eval/sig-extraction/`, `eval/heldout/`, `eval/results/` or `src/eval/sigBaselines.ts`. They get this spec and the convention sheet below, nothing else from the repository.
- **Labels.** Two families label every line on their own, each blind to the other's labels and to any model output.
- **Adjudication.** Kevin Madden, PharmD, settles every disagreement, without seeing model outputs. Both raw label sets and the adjudicated set are kept.
- **Agreement.** Report agreement per field: percent agreement and Cohen's kappa, with denominators.

## What the set must contain

- **Size.** At least 300 lines, and at least 20 lines in each category below. One line may count toward several categories. With 300 lines, an exact 95% interval for 285/300 is roughly 92 to 97%, which is narrow enough to separate a 95% model from a 99% one.
- **Line shape.** Each line is one sig or one short order fragment of the kind a pharmacy or a discharge list actually holds. Lengths should span 20 to 300 characters. Some lines are messy on purpose.
- **Data.** Synthetic only. No real patient data, and no real names, dates of birth or record numbers. Public OTC "Directions" text from openFDA is allowed, with its source URL recorded.

Categories:

1. Plain scheduled lines (once daily, twice daily, every 8 hours).
2. Abbreviations and Latin (qd, bid, tid, qid, qhs, qam, q4h, q6h, q8h, q12h, po, sl, subq, gtt, prn, with and without periods, upper and lower case).
3. Dose arithmetic: tablet counts times strength, halves and quarters (written ½, 1/2 and "one-half"), liquids (mg per mL, mg per 5 mL), puffs times mcg per actuation, sprays per nostril, units.
4. Ranges: 1 to 2 tablets, every 4 to 6 hours.
5. As-needed lines, with and without an interval, and with a reason.
6. Daily maximums ("max 3 g in 24 h", "not more than 6 tablets a day").
7. Time and meal anchors (bedtime, morning, with meals, before breakfast, 30 minutes before a meal).
8. Weekly and day-of-week dosing (methotrexate weekly, alendronate weekly, warfarin by weekday).
9. Tapers and multi-phase regimens.
10. Conditional dosing: sliding scales and hold parameters ("hold if SBP < 100").
11. Stopped, held or negated medications, including mixed lines where one drug stops and another continues.
12. More than one drug in a line.
13. Brand names, to be normalized to the ingredient.
14. Salt and release forms that change the product (metoprolol tartrate vs succinate ER).
15. Routes other than by mouth (sublingual, inhaled, nasal, ophthalmic, transdermal, subcutaneous).
16. Durations ("x 7 days", "for 10 days").
17. Weight-based pediatric dosing, with and without the weight given.
18. Combination products.
19. Missing information the model must not invent (no strength, no drug name, "take as directed").
20. Noise: misspellings, OCR errors ("5OO mg", "rng"), missing spaces ("500MG"), all capitals.
21. Spanish or mixed English and Spanish fragments.
22. Text inside the line that tries to give the model instructions. It must be treated as text, not obeyed.
23. Lines that test the conventions on purpose, such as "at bedtime as needed" and "every 6 hours as needed", labeled by the convention sheet.

## Target and labels

- **Full target.** Each line gets the full target, aligned with FHIR Dosage. A line holds a list of medications. Each medication has:
  - `drug_text`, as written, and `ingredient`, the normalized generic name.
  - `salt_or_release`.
  - `status`: active, stopped, held or negated.
  - `dose`: a value, a low and high range, or null, with a unit (UCUM), or a quantity and form such as 2 tablets.
  - `dose_basis`, such as per kg.
  - `route`.
  - `schedule`: count per period, period unit, minimum and maximum interval in hours, days of week, and anchors.
  - `as_needed` and `as_needed_reason`.
  - `max_dose_per_period`.
  - `duration`.
  - `phases`, for tapers.
  - `conditions`, for holds and sliding scales.
  - `needs_review`: a flag and a reason.
- **Six-field projection.** Each line also gets its projection onto the current six fields (drug, dose per administration, frequency, timing, prn, reason), plus `six_field_representable: true or false`.
  - Lines the six fields cannot hold (tapers, ranges, sliding scales, two drugs, weekday-dependent doses, missing dose) are marked false.
  - On those lines, the only correct behavior under the six-field prompt is to flag the line for review, so the six-field results report them separately.
- **Convention sheet.** It is written and frozen before any line is labeled. It starts from two rules Kevin decided on 3 November 2026:
  - **At bedtime as needed** means no fixed schedule, as needed, and at most once a day. In the full target: no schedule, a bedtime anchor, `as_needed` true and a maximum of one dose per day. In the six-field projection: frequency null, timing bedtime, prn true. The suite file sets `conventions.bedtimeAsNeeded` to `no-schedule`.
  - **The schedule and the as-needed maximum are separate fields.** In the full target, a schedule goes in `schedule` and an as-needed limit goes in `max_dose_per_period` or the minimum interval, never in both. In the six-field projection, `frequency` holds a schedule only, so an as-needed line with no schedule has frequency null. Its maximum is scored in the full target.
  - The sheet must also settle q12h vs BID, "daily" vs "every 24 hours", and how ranges are written.
  - Any line whose label still depends on a contested convention is tagged `contested: true`, scored both ways, and left out of the gate.
- **Critical fields.** Each label marks which fields are critical: drug, dose magnitude, schedule of a scheduled dose, route, and as-needed status. Critical errors are counted on their own.

## Locking

1. **Deduplicate.** Before locking, drop any line whose instruction words overlap any development or template line by a Jaccard similarity of 0.7 or more, and record what was dropped.
2. **Freeze the code.** The scorer for the full target must be written and frozen before the set is unsealed. The six-field projection uses scorer v3 (`src/eval/sigScoreV3.ts`) as committed on branch `claude/local-model-workshop-real-world`, and the rules baseline is `src/eval/sigBaselines.ts` from the same commit. The coordinator records that commit hash in the lock manifest.
3. **Commit the lock.** In one commit, add the inputs, both raw label sets, the adjudicated labels, the convention sheet, the dedup record, the agreement table, and a manifest. The manifest lists the SHA-256 of every file, the scorer and baseline file hashes, the model list with Ollama digests, all settings, and the decision rule below. Tag that commit.
4. **Do not change it.** No line, label, prompt, schema, scorer or setting changes after the first run. Any change after the first run makes the set development data, and a new set is then needed.

## Run protocol

- **Machine.** A quiet machine: one-minute load average below 2 for five minutes before each model starts, sampled every second during the run. The machine and its memory are recorded.
- **Command.** `npm run eval -- --suite <locked file> --order random --seed <recorded> --warmups 2 --timeout-ms 60000 --out <new folder>`.
  - The suite file states the rule for "at bedtime as needed" in `conventions.bedtimeAsNeeded` (`once-daily` or `no-schedule`), and the rules baseline follows it.
  - Three passes per model, with model order shuffled in each pass.
  - Digests and sizes are recorded by the harness.
- **Candidates.**
  - The three models already on the test machine.
  - At least two models that fit a 16 GB Mac (3 to 8B).
  - The frozen rules baseline, the constant floor and the copy control.
  - A hosted reference model on this synthetic set only if Kevin approves it in advance, because it sends text off the machine and costs money.
- **Same budget for every model.** Thinking settings are matched where the model allows it, and recorded where it does not.

## Pre-registered decision rule

1. **Critical errors.** Count them over all lines. The upper bound of the exact 95% interval for the critical-error rate must be at or below 2%.
2. **Six-field correctness.** All six fields right on representable lines, with an exact 95% interval. Lines that cannot be represented and contested lines are reported separately.
3. **Latency.** p95 at or under 10 s on the quiet machine, over at least 300 requests, failures included. The first request after warm-up is reported separately.
4. **Memory.** Peak resident memory, not disk size, breaks ties.

If no model passes, the result is "no eligible model", and that is published. Every result is shown next to the rules baseline. Every miss is published, with its category.

## Reporting

- Every number carries its denominator and an exact 95% interval.
- A per-category table, with the rules baseline in every table.
- Agreement statistics for the labels.
- The contested lines, scored both ways.
- The lock commit hash and the run commit hash.
