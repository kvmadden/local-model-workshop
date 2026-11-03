# Results on the development sets

Every number here comes from a committed file. No model was run to produce this page. `src/eval/developmentResultsDoc.test.ts` recomputes every table on this page from the saved replies and compares it with the page, cell by cell, so `npm test` fails if a number here and the evidence disagree. The tests named under each table check the same numbers from the scoring side.

## Why both sets are development data

- **The 25 lines** (`eval/sig-extraction/cases.jsonl`).
  - The split format, its prompt and its labels were revised after the first-format runs on these same lines, on the same day.
  - The prompt's rules and worked examples spell out the constructs of 17 of the 25 lines, for example "every 12 hours is every_12_hours, not twice_daily" and "15 mL of 100 mg/5 mL is 300 mg".
- **The 12 template lines** (`eval/heldout/frozen.json`).
  - They are six instruction templates taken from the 25 lines, each filled in twice with a made-up drug name and one of four strengths.
  - Two of the six templates are the two lines that decided the model ranking ("tid prn itching" and "at bedtime as needed for sleep").
  - They were committed before their runs (commit `1b528e3`, 2026-10-31, before the runs of 2026-11-01). That makes them a prospective regression check, not an independent test.

A headline number needs a set that is written blind and locked before its first run. That protocol is in [FRESH-TEST-PROTOCOL.md](FRESH-TEST-PROTOCOL.md). The set itself is not written yet.

## Every field right

Exact 95% binomial intervals are shown in brackets. Models ran through the app's FlowRunner and Ollama adapter at temperature 0 under JSON-schema constrained decoding. Baselines ran without any model.

| Row | 25 lines, split format | 12 template lines, split format | 25 lines, first format | 12 template lines, first format |
|---|---|---|---|---|
| gpt-oss:20b | 24/25 and 24/25 [79.6 to 99.9%] | 10/12 [51.6 to 97.9%] | 25/25 and 25/25 | 12/12 |
| gemma4:31b | 25/25 and 25/25 [86.3 to 100%] | 12/12 [73.5 to 100%] | 25/25 and 25/25 | 12/12 |
| qwen3.8:27b | 25/25 and 25/25 [86.3 to 100%] | 12/12 [73.5 to 100%] | 23/25 and 24/25 | 9/12 |
| Rules parser (no model) | 25/25 [86.3 to 100%] | 12/12 [73.5 to 100%] | not run | not run |
| Constant answer | 0/25 | 0/12 | not run | not run |
| Copy the line into every field | 0/25 | 0/12 | not run | not run |
| Echo mock | 0/25 and 0/25 | 0/12 | 0/25 and 0/25 | 0/12 |

- **Format and scoring.**
  - The split format scores six fields: drug, dose per administration, frequency, timing, as-needed use and reason.
  - The first format scores three: drug, dose and frequency. It also gave full credit for dropping as-needed use. For example, gemma4:31b answered `three_times_daily` for "tid prn itching" and was scored all correct. So the two formats measure different targets, and the first-format column is not a "before" for the split column.
  - Model rows use the scorers that produced them. Scorer v3 gives the same verdict on every saved split-format reply, parse status included, and the same drug and dose verdicts on every first-format reply (`src/eval/evidenceRescore.test.ts`). Baseline rows use scorer v3.
- **Sources.**
  - Model rows: `eval/results/2026-10-30-v2-run1`, `2026-10-30-v2-run2`, `heldout-v2`, `archive/schema-v1/*` and `heldout-v1`.
  - Baseline rows: `eval/results/2026-11-03-baselines-dev25` and `2026-11-03-baselines-templates12`.
- **Rules parser.** It is `src/eval/sigBaselines.ts`. It was written after its author had read both sets, so its perfect score measures how regular the sets are, not how well rules do on real text. It is frozen now, so nobody can retune it after a later set is written. Frozen does not make it a strong parser for other lines. It knows the patterns of these sets plus a few general rules: a digit inside a drug name, a schedule word after "not", and either rule for "at bedtime as needed". It reports the words it could not read.
- **Echo mock.** It scores zero because the prompt it repeats holds no valid JSON object, so there is nothing to score. A test checks that both prompts stay that way. That only shows the harness runs. The copy row is the real test that copying earns nothing. Under the old v2 scorer, a reply that copied the line into the drug field got drug credit on 25 of 25 lines.

## Per field, against a floor

The 25 lines, split format. Each model row was identical in both runs. The constant row answers "once daily, no timing, not as needed, no reason" for every line.

| Row | Drug | Dose | Frequency | Timing | As needed | Reason |
|---|---|---|---|---|---|---|
| gpt-oss:20b | 25/25 | 25/25 | 24/25 | 25/25 | 25/25 | 25/25 |
| gemma4:31b | 25/25 | 25/25 | 25/25 | 25/25 | 25/25 | 25/25 |
| qwen3.8:27b | 25/25 | 25/25 | 25/25 | 25/25 | 25/25 | 25/25 |
| Constant answer | 0/25 | 0/25 | 11/25 | 18/25 | 18/25 | 18/25 |

Tests: `src/eval/sigBaselines.test.ts` for the constant row, `src/eval/evidenceRescore.test.ts` for the model rows.

## What the misses are

- **Count.** 372 model answers were scored: 3 models on the 25 lines (two runs in each format) and on the 12 lines (one run in each format).
- **What was wrong.** None got the drug or the dose wrong. All 10 misses are the frequency of an as-needed line that also has a schedule or a bedtime anchor:
  - qwen3.8:27b, first format: "tid prn itching" answered as needed (s24 in both runs, h01, h07). "at bedtime as needed" answered as needed (s25 in run 1 only, h08).
  - gpt-oss:20b, split format: "at bedtime as needed" answered with no schedule (s25 in both runs, h02, h08).
- **What that means.** On these lines, the ranking comes from how the format encodes "as needed" next to a schedule or a bedtime anchor, not from reading errors.
- **Instability.** qwen3.8:27b gave different first-format answers to two lines that differ only in the made-up drug name (h02 and h08). It also changed its answer to s25 between two runs at temperature 0.
- **Where the full list is.** Every miss is listed in [MISSES.md](MISSES.md).

## Six lines hold instructions the six fields cannot score

The rules parser reports every word it could not read instead of treating it as absent. On the 25 lines it could not read part of 6:

| Line | Unread words |
|---|---|
| s04 | 10 days (duration) |
| s05 | empty stomach (administration condition) |
| s10 | x 5 days (duration) |
| s12 | Mondays (day of week) |
| s13 | x 7d (duration) |
| s19 | max 10 tabs/day (daily maximum) |

An all-fields match on these lines does not mean the whole instruction was kept. Route is not scored on any line.

## The pick depends on one label rule

The split-format gold labels "at bedtime as needed" (s25, h02, h08) as frequency `once_daily`. The extraction audit protocol in this same repository takes the opposite rule: "Bedtime does not imply a daily schedule" (`eval/extraction-audit/AUDIT.md`, challenge c03). Recomputed from the saved replies (`src/eval/decision.test.ts`):

| Rule for "at bedtime as needed" | Lines and runs | Latency gate | All fields right (gpt-oss, gemma, qwen) | Pick |
|---|---|---|---|---|
| Frequency `once_daily` (current gold) | 25 lines, 2 runs | Not applied, as published | 24, 25, 25 in each run | qwen3.8:27b, on 1.2 GB less disk |
| Frequency `once_daily` | 25 lines, 2 runs | Applied to each run | 24, 25, 25 in each run | None. Every p95 was over 10 s |
| No schedule (the audit's rule) | 25 lines, 2 runs | Not applied | 25, 24, 24 in each run | gpt-oss:20b, the only model with all 25 right |
| No schedule | 25 lines, 2 runs | Applied to each run | 25, 24, 24 in each run | None. gpt-oss:20b's p95 was over 10 s |
| Frequency `once_daily` | 12 template lines, 1 run | Not applied | 10, 12, 12 | qwen3.8:27b, on 1.2 GB less disk |
| Frequency `once_daily` | 12 template lines, 1 run | Applied to the same run | 10, 12, 12 | gemma4:31b (8.5 s against 12.5 s) |
| No schedule | 12 template lines, 1 run | Not applied | 12, 10, 10 | gpt-oss:20b, the only model with all 12 right |
| No schedule | 12 template lines, 1 run | Applied to the same run | 12, 10, 10 | gpt-oss:20b (7.7 s) |

Each row scores one set and takes its latency from the same runs. The 12 template lines had one run per model, so the stability gate (the same answers in every run) could not be tested there and is not applied.

Notes:

- **Disk sizes.** The sizes (13.8, 19.4 and 18.2 GB) are from [ORIGINAL-EVALUATION.md](ORIGINAL-EVALUATION.md). The harness of 2026-10-30 did not record them. It now records digest and size.
- **Which rule.** Which rule is right is a pharmacist's decision, listed in [KEVIN-REVIEW.md](KEVIN-REVIEW.md).

## Latency: what the saved runs show and do not show

None of these runs was on a quiet machine, so none is a latency result. They do show three things the earlier docs did not say.

| Runs | 1-minute load (10 cores) | p95 or slowest line, gpt-oss / gemma / qwen |
|---|---|---|
| First format, 25 lines, run 1 | not recorded | 19.4 / 7.9 / 5.6 s |
| First format, 25 lines, run 2 | 74 to 154 | 9.2 / 8.7 / 5.3 s |
| Split format, 25 lines, run 1 | 138 to 247 | 11.7 / 11.1 / 12.6 s |
| Split format, 25 lines, run 2 | 320 to 468 | 11.5 / 20.6 / 16.3 s |
| Split format, 12 lines | 166 to 242 | 7.7 / 8.5 / 12.5 s |

1. **The 10-second budget was met in some runs.** In the first-format runs, gemma and qwen met it in run 1 and all three met it in run 2. In the 12-line split-format run, gpt-oss and gemma met it. The earlier statement that no model met the budget holds only for the two split-format runs on the 25 lines.
2. **The slowest line is usually the first request after warm-up.** For qwen3.8:27b that held in 6 of 6 runs, for gemma4:31b in 2 of 6, and for gpt-oss:20b in 0 of 6. Cases always ran in file order, so this delay always landed on the same line. qwen's 12.5 s on the 12 lines is its first request. Without it, its slowest line took 5.5 s. `src/eval/harness.test.ts` reads these facts from the saved files.
3. **Split-format replies were slower in these runs.** On the 12 lines, the p50 (nearest rank) went from 3.3 to 6.6 s for gpt-oss, 4.9 to 7.1 s for gemma, and 3.9 to 4.6 s for qwen. The split format asks for six fields instead of three, which may explain part of it. The two runs were at different times on a shared machine, with a 1-minute load of 201 to 311 for the first format and 166 to 242 for the split format. So this is an observation, not a measured cost.

With 12 lines, the nearest-rank p95 is simply the slowest line. With 25 it is the second slowest. The harness now randomizes case and model order, makes two warm-up requests, reports the first request apart, and counts failed requests at the time they took.

## What these sets cannot tell you

- Whether any model reads real or messy instructions correctly. The lines are 36 to 96 characters, clean, single-drug and always state a strength.
- Whether a model beats rules. Rules match the models here.
- Which model is fastest on a quiet machine, or on a 16 GB laptop.
- Whether the 3 to 8B models in the workshop catalog would do as well. None was run.
