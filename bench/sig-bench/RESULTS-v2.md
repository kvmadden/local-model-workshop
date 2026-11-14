# Sig bench v2: first model results

**Headline.** On the 49 lines Kevin reviewed, Claude Opus 5.5 on the subscription caught 18 of the 20 real prescriber questions with one false alarm, the best local model (qwen3.8:27b) caught 16 and would still have dispensed a daily alendronate and a 4,000 mg a day metformin ER at high confidence, and no source reliably named whether law or a standard required the call.

**Status.** Run on 13 November 2026. The ground-truth tables use only the 49 lines Kevin Madden, PharmD, reviewed (label status `confirmed` or `kevin-notes`). The 71 proposed lines are scored in their own table, marked provisional, and never pooled with the 49. This is development data, not a held-out result. See [What to read with care](#what-to-read-with-care) before quoting any number.

## What ran

| Source | How it was called | Decoding |
|---|---|---|
| rules parser | the frozen parser through its v2 wrapper (`src/eval/sigBaselinesV2.ts`) | n/a |
| claude-opus-5-5 | the `claude` command-line tool in print mode on Kevin's Claude subscription, signed in as claude.ai, with a clean environment, no API key, no tools, and no user or project settings, memory or hooks | free text, read by the same JSON reader as the others |
| gemma4:31b, qwen3.8:27b, gpt-oss:20b, llama3.2:3b | Ollama through the app's own FlowRunner and adapter, the path `scripts/eval-sig.ts` uses, at temperature 0 with the think setting from `eval/sig-extraction/models.json` (gpt-oss low, gemma and qwen off, llama none) and an 8,192 token context | JSON schema from `schema-v2.json` (constrained decoding) |

Every source got the same prompt: a short system instruction framed as pharmacist verification (`prompt-v2/system.txt`) and one user message (`prompt-v2/user.txt`) that describes the reply shape and ends with the e-prescription fields only: drug, strength, dosage form, sig, quantity and days supply. No label, note or category reached a model.

Sources ran one at a time with a 120 second deadline per line. Before each line the run read the one-minute load average and waited while it was above 150. The machine (an M1 Max with 64 GB) is shared with CI runners. The load average at the start of each line ran from 15 to 148, and the run paused several times when it rose above 150. Raw replies, errors and wall times are in `results/models-v2/raw-*.jsonl`, one row per line, and each run's settings, prompt hashes and Ollama digests are in `results/models-v2/runs.jsonl`. Scores are in `results/models-v2.json`.

To reproduce: `npm run bench:sig:v2:run -- --source ollama:qwen3.8:27b --subset reviewed`, then `npm run bench:sig:v2:report`. A rerun resumes and skips lines already in the raw file.

Columns:

- **Flag accuracy**: the reply's flag (call the prescriber or not) matches the label, on every line.
- **Calls caught**: of the lines the label flags for a real reason, how many the reply flagged. The 7 lines flagged only as `reviewer_hold` are left out (see below).
- **False alarms**: of the lines the label does not flag, how many the reply flagged anyway.
- **Tier accuracy**: on flagged lines with a tier, the reply named the same one (law, standard or judgment).
- **Likely-reading fields right**: the 23 scored fields of the likely reading, summed over the lines whose label has one.
- **Dispensed its guess**: lines whose label has a likely reading but where law or a standard requires a call first, and the reply said no call was needed. A reply that failed to parse is counted under parse failures, not here.

<!-- generated:start (npm run bench:sig:v2:report) -->

## Ground truth: the lines Kevin reviewed

Label status confirmed or kevin-notes. 49 lines: 27 flagged (7 of them only as reviewer_hold), 20 with a clarification tier, 42 with a likely reading, 11 where a likely reading exists but law or a standard requires a call first.

| Source | Replies | Parse failures | Flag accuracy | Calls caught (holds left out) | False alarms | Tier accuracy on flagged lines | Likely-reading fields right | Readings with every field right | Dispensed its guess where law or a standard required a call | Median time per line |
|---|---|---|---|---|---|---|---|---|---|---|
| rules parser | 49/49 | n/a | 26/49 (53%) | 11/20 (55%) | 7/22 (32%) | 0/20 (0%) | 795/966 (82%) | 0/42 (0%) | 5 of 11 | n/a |
| claude-opus-5-5 (subscription CLI) | 49/49 | 0 | 39/49 (80%) | 18/20 (90%) | 1/22 (5%) | 6/20 (30%) | 905/966 (94%) | 7/42 (17%) | 0 of 11 | 13.4 s |
| gemma4:31b | 49/49 | 2 (2 timed out or errored) | 34/49 (69%) | 15/20 (75%) | 3/22 (14%) | 6/20 (30%) | 746/966 (77%) | 0/42 (0%) | 0 of 11 | 40.2 s |
| qwen3.8:27b | 49/49 | 0 | 37/49 (76%) | 16/20 (80%) | 2/22 (9%) | 4/20 (20%) | 777/966 (80%) | 1/42 (2%) | 1 of 11 | 31.1 s |
| gpt-oss:20b | 49/49 | 1 (1 timed out or errored) | 32/49 (65%) | 11/20 (55%) | 2/22 (9%) | 1/20 (5%) | 708/966 (73%) | 0/42 (0%) | 5 of 11 | 14.4 s |
| llama3.2:3b | 49/49 | 0 | 27/49 (55%) | 20/20 (100%) | 22/22 (100%) | 1/20 (5%) | 700/966 (72%) | 0/42 (0%) | 0 of 11 | 9.1 s |

Most-missed likely-reading fields on these lines, as misses out of the lines with a likely reading:

- rules parser: route 42, dose 21, frequency 21, quantity 18
- claude-opus-5-5 (subscription CLI): frequency 15, duration_days 14, package 10, max_doses_per_day 9
- gemma4:31b: package 40, duration_days 34, frequency 19, max_doses_per_day 13
- qwen3.8:27b: duration_days 38, frequency 25, dose 15, quantity 15
- gpt-oss:20b: duration_days 37, package 31, dose 23, frequency 22
- llama3.2:3b: package 41, quantity 35, dose 28, laterality 28

## Provisional: the proposed lines

**Provisional. Nobody has reviewed these labels.** Claude proposed them, and a score here is agreement with a proposal, not accuracy. 71 lines: 0 flagged (0 of them only as reviewer_hold), 0 with a clarification tier, 71 with a likely reading, 0 where a likely reading exists but law or a standard requires a call first.

| Source | Replies | Parse failures | Flag accuracy | Calls caught (holds left out) | False alarms | Tier accuracy on flagged lines | Likely-reading fields right | Readings with every field right | Dispensed its guess where law or a standard required a call | Median time per line |
|---|---|---|---|---|---|---|---|---|---|---|
| rules parser | 71/71 | n/a | 57/71 (80%) | n/a | 14/71 (20%) | n/a | 1469/1633 (90%) | 0/71 (0%) | 0 of 0 | n/a |
| claude-opus-5-5 (subscription CLI) | 71/71 | 0 | 70/71 (99%) | n/a | 1/71 (1%) | n/a | 1567/1633 (96%) | 34/71 (48%) | 0 of 0 | 8.3 s |
| gemma4:31b | 71/71 | 1 (1 timed out or errored) | 69/71 (97%) | n/a | 1/71 (1%) | n/a | 1442/1633 (88%) | 0/71 (0%) | 0 of 0 | 28.9 s |
| qwen3.8:27b | 71/71 | 0 | 68/71 (96%) | n/a | 3/71 (4%) | n/a | 1513/1633 (93%) | 5/71 (7%) | 0 of 0 | 26.1 s |
| gpt-oss:20b | 71/71 | 0 | 57/71 (80%) | n/a | 14/71 (20%) | n/a | 1374/1633 (84%) | 0/71 (0%) | 0 of 0 | 22.1 s |
| llama3.2:3b | 71/71 | 0 | 0/71 (0%) | n/a | 71/71 (100%) | n/a | 1271/1633 (78%) | 0/71 (0%) | 0 of 0 | 11.5 s |

<!-- generated:end -->

## Three telling errors

All three are on lines Kevin reviewed.

1. **Alendronate read as a daily drug (sb-052).** The prescription: alendronate 70 mg tablet, sig "1 tab po daily", quantity 4 for 28 days. qwen3.8:27b and gpt-oss:20b did not flag it and read 70 mg once daily at high confidence, with no safety note. Kevin's label flags it (`frequency_product_mismatch`, a weekly product written daily) and reads it as once weekly. The quantity, 4 tablets for 28 days, already pointed to weekly.
2. **Digoxin "125 mg" passed as written (sb-046).** The prescription: digoxin 125 mg tablet, sig "1 tab po qd". gpt-oss:20b did not flag it, gave no safety note and rated its reading high confidence. Kevin's label flags it (`implausible_dose_unit`). His note says he would end up assuming mcg but it should be confirmed. Claude Opus 5.5 read 125 mcg and flagged it for the call.
3. **Metformin ER at 4,000 mg a day dispensed (sb-048).** The prescription: metformin ER 1000 mg tablet, sig "2 tabs po bid". gemma4:31b, qwen3.8:27b and gpt-oss:20b all read 2,000 mg twice daily at high confidence with no flag. Kevin's label flags it (`exceeds_usual_max`) and gives no likely reading, because nothing should be dispensed until the prescriber answers. Only Claude Opus 5.5 and llama3.2:3b, which flags every line, flagged it.

## What to read with care

- **The tiers are not Kevin's ruling.** Kevin reviewed the flags and readings. The law, standard or judgment tier on each flagged line comes from the appendix of `CLARIFICATION-RULES.md`, which is an inferred reading of the cited rules. Most sources answered "standard" where that table says "law", so tier accuracy measures agreement with the table, and the "dispensed its guess" count depends on it too.
- **Seven flags are review holds.** On 7 reviewed lines the only flag reason is `reviewer_hold`: Kevin questioned the label, not the prescription. A model that rightly does not flag those lines loses flag accuracy. The calls-caught and false-alarm columns leave them out.
- **Most reading misses are format, not pharmacy.** The most-missed fields are `duration_days` (filled in from the days supply), `frequency` (an as-needed interval such as q4h prn written as a schedule, where the labels use null), `package` (guessed) and `max_doses_per_day`. The prompt did not teach those label conventions. My read, not a measured split: field accuracy understates how well the models read the drug, dose and schedule.
- **Claude wrote the lines, the labels, the tier table, the scorer and the prompt, and Claude Opus 5.5 is one of the sources scored.** Kevin's review checks the 49 labels, but shared conventions can still favor a Claude model.
- **llama3.2:3b flags every line.** Its perfect catch rate and zero "dispensed" count are not skill. Read them with its false alarms.
- **Decoding differs.** The local models answered under a JSON-schema constraint, which guarantees a parseable shape. Claude answered in free text and still had no parse failures.
- **Speed is not a clean measurement.** The machine was shared and loaded. A timed-out line counts as a miss on every tier (gemma4:31b 2 and gpt-oss:20b 1 on the reviewed lines, gemma4:31b 1 on the proposed lines). Median times are on a busy machine and are not a speed result.
- **The proposed table is provisional.** All 71 proposed lines are unflagged, so that table can show false alarms and reading agreement only, against labels nobody has reviewed.
