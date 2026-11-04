# Run plan: fresh blind test of three local models

Registered on 2026-11-03, before any of the three models has run on the set. The protocol is [`docs/FRESH-TEST-PROTOCOL.md`](../../docs/FRESH-TEST-PROTOCOL.md). This plan applies it, says where it differs, and fixes the choices the protocol leaves open. Read [`LOCK-NOTE.md`](LOCK-NOTE.md) first for what the set is and what was disclosed. All hashes are in [`lock.json`](lock.json).

No line text, no label and no model reply is in this repository. Nothing is scored until the one scoring run in step 5 of "Order of events".

## 1. What is run

- **Set.** All 455 lines of the locked set. Every result is reported twice, over all 455 lines and over the 454 lines without `w-0193` (see the lock note). Neither reading is the headline. If a gate decision differs between them, the report says so.
- **Models.** The three models in `eval/sig-extraction/models.json`, run through the local Ollama server, version 0.40.6.

  | Model | Thinking setting | Digest (SHA-256) | Size in bytes |
  |---|---|---|---|
  | `gpt-oss:20b` | low (it does not accept off) | `f38aa0c53da5f8c49d08c43a99df24ff53167fe68e24664a7777288e7656fdfe` | 13,793,441,566 |
  | `gemma4:31b` | off | `92808281a855666acf35743d49004bb30c810152cd004baf78f31b4578920e49` | 19,424,434,885 |
  | `qwen3.8:27b` | off | `47951e4a666180bc2aedfc93c169472f2de783696fe196efbf063f5730ecf163` | 18,174,721,847 |

- **Settings.** Temperature 0. Replies are constrained to the JSON schema of the six fields. One request per line, with no retries. A per-request limit of 60 seconds, and a timeout counts as a failed request. Two untimed warm-up requests per model at the start of each pass, on a line that is in no suite. The prompt, the schema and `models.json` are the files hashed in `lock.json`.
- **Harness and commit.** `npm run eval` (the eval CLI, "eval-sig v3"), run from a clean checkout of commit `b6a013b092f6878cc57d5e5c1b54fc2adc137c2a`, the tip of `main` before this registration. The harness, the scorers, the prompt and the schema are the files hashed in `lock.json` under `pinned_code`. The harness also hashes every file it imports before the first request and checks them again at the end, and it records the commit it ran from.
- **Passes.** Two passes, `--order random`, with seeds 20261104 and 20261105. The seed sets the order of the models and the order of the lines inside each model. Each pass runs all 3 models over all 455 lines. That is 2 x 3 x 455 = 2,730 timed requests, and 910 per model.
- **The suite file used for the run.** It is built from the staged `lines.jsonl` (id and text only), with one placeholder gold record on every line. The harness scores each reply as it arrives, so a placeholder keeps anyone from seeing a score before the scoring run. The in-run scores and the summary tables of these passes are not results and are never reported. The suite file's hash and its builder's hash are in `lock.json` under `inference`. The file sets `conventions.bedtimeAsNeeded` to `no-schedule`.
- **Nobody reads the replies before scoring.** The passes are watched by counts only: rows written, request errors and latencies. The raw replies, the summaries, the logs and the memory samples are kept outside the repository and are published with the results.
- **If a pass stops early.** The folder it wrote is kept and reported. The lines it did not finish are run in a supplementary pass with the same model and settings, and the report says so. A pass is never silently redone.

## 2. The gates, in the protocol's order

1. **Critical errors.** The upper bound of the exact 95% interval for the critical-error rate must be at or below 2%. The counter is not written yet (see "Not frozen yet"). Its default rule is in "Choices fixed here".
2. **Six-field correctness.** All six fields right, on lines the six fields can hold, with an exact 95% interval. Lines the six fields cannot hold (208) are reported separately, and so are contested lines.
3. **Latency.** p95 at or below 10 seconds, over at least 300 requests, failures included. The first request after warm-up is reported separately. The harness records every request's latency, and its summary rule is the one in `src/eval/harness.ts`.
4. **Memory.** Peak resident memory, not disk size, breaks ties.

If no model passes, the result is "no eligible model", and that is published. Every miss is published with its category, and every table shows the rules baseline next to the models.

`src/eval/decision.ts` is the development-era recompute (every field right on every line in every run, then disk size). It is not the decision rule for this set and is not used.

## 3. How the scoring works

- **Inputs.** The saved reply text of both passes, the final gold, and the scorer.
- **Final gold.** The six-field projection of the adjudicated labels, with Kevin's answers applied. Kevin's review of the 12 disputed lines (and, if he does it, the optional spot check of 10) is applied before the scoring run. A disputed line he has not answered keeps its adjudicated label and is marked unreviewed in the report, with the count.
- **Scorer.** Scorer v3, `src/eval/sigScoreV3.ts`, and the frozen rules baseline, constant floor and copy control from `src/eval/sigBaselines.ts`, both as hashed in `lock.json`. The baselines need no model and run once, at scoring time, on the final suite file.
- **Convention sheet.** SHA-256 `3ee4ec0b26491006d629c992213717adba3a1a25826b3323c9778d252e06f9ec`. The sheet was frozen before any line was written or labeled.
- **Kevin's ruling on "at bedtime as needed".** No fixed schedule, as needed, at most once a day. In the six-field projection that is frequency null, timing bedtime, prn true. The schedule and the as-needed maximum are separate fields. The 7 C1 lines with a bedtime anchor are ordinary lines under this ruling, scored on the primary reading and counted in the gate.
- **Contested lines.** The 6 C1 lines with a morning or an evening anchor and the 14 C2 lines are scored both ways, with the other reading taken from `alt`, and are left out of the gate. 20 lines in all. All 27 contested lines are ones the six fields can hold, so 247 - 20 = 227 representable lines are in the gate before the `w-0193` reading. These counts are recomputed after Kevin's answers.
- **Score once.** The scoring run happens one time, after the scoring code is frozen and Kevin's answers are in. If an error is found afterward, the report shows the original result and the corrected one side by side. Nothing is re-scored quietly.
- **Reporting.** As in the protocol: every number with its denominator and an exact 95% interval, a per-category table with the rules baseline in every table, the agreement statistics, the contested lines scored both ways, and the lock and run commit hashes. The lock commit is the merge commit of the pull request that added this folder. The run commit is the one above.

## 4. The 109 lines left out

109 lines were written, deduplicated and labeled by Grok and have no Gemini label. They are not in the set, and no model is run on them. The Gemini account quota ran out three times on 3 November, and labeling stopped. Gemini was sent the lines of the thinnest categories first, so the 109 left-out lines are not a random sample of what was written. A line is in the set only if both families labeled it. The left-out lines stay unlabeled by the second family and are not used for anything in this test.

## 5. Where this differs from the protocol

1. **The machine is not quiet.** The protocol asks for a one-minute load average below 2 for five minutes before each model starts. The test machine is shared with other background jobs, and its load average was about 40 to 50 when this plan was written. The harness samples the load every second, and a second sampler records it with memory every 5 seconds. The latency gate is reported as "measured under load, not on a quiet machine", with the load range. Load can only make latency look worse. A latency pass under load stands. A latency fail under load is reported as not shown on a quiet machine, and the report says what the load was.
2. **Two passes, not three.** The protocol says three passes per model. This plan runs two, as the coordinating session instructed on 3 November. With temperature 0 the two passes also show whether answers are stable. A third pass can be added before scoring if one is asked for. It would be added by a dated amendment here before it starts.
3. **Candidates.** The protocol lists the three models on the test machine, at least two 3 to 8B models, the baselines, and an optional hosted reference. This run covers the three models and, at scoring time, the baselines. The 3 to 8B models and the hosted reference are not part of it. The report says they were not run.
4. **The set is not committed here.** The protocol's lock step commits the inputs and labels. This registration commits hashes only, so that no line is public before the scoring run. The set is published with the results.
5. **The full-target scorer is frozen late.** The protocol asks for the full-target scorer to be frozen before the set is unsealed. It does not exist yet. See "Not frozen yet".

## 6. Choices fixed here

These were not settled by the protocol. They are fixed now, before any reply exists, and change only by a dated amendment before scoring.

1. **Two passes, one verdict.** A model passes a gate only if it passes it in both passes. Numbers are reported per pass. Counts are not pooled across passes, because the two passes are not independent at temperature 0. The report also says how many lines got a different parsed answer between the passes.
2. **Critical errors.** A critical error is a reply that disagrees with the gold on a field marked critical for that line, among the fields a six-field reply can hold: drug, dose magnitude, frequency (for a scheduled dose) and as-needed status. A reply that cannot be parsed counts as a critical error. Route is marked critical on many lines, but the six-field reply has no route, so route is reported as not checkable. The count is made over the lines the six fields can hold and outside the contested set, the same lines as gate 2, because a six-field reply cannot be wrong on a field it has no place for. This is narrower than the protocol's "over all lines" and is a deliberate choice, open to change by amendment.
3. **C1 lines with a morning or evening anchor.** Contested until Kevin says whether the bedtime ruling holds for other times of day. If he says yes before scoring, they join the gate on the primary reading.
4. **Drug names written differently from the ingredient.** The frozen prompt asks for the drug name as written, and the gold drug is the ingredient (a brand name gives the ingredient). On the 25 gate lines where the written name lacks the ingredient's words (brand names, abbreviations, misspellings), a reply counts as right for the drug field if it matches either the ingredient or the drug as written. The report gives the count of such lines and also shows the drug field with the ingredient-only reading.

## 7. Not frozen yet

- **The critical-error counter and the scoring script.** Neither exists at the pinned commit. They are written from this plan and the protocol, without reading any reply, and committed in a separate pull request before anything is scored. Their hashes are then added to `lock.json` by a dated amendment. The model passes may already be finished by then, but no reply has been read or scored.
- **The scorers already frozen.** Scorer v3, the baselines, the harness, the prompt and the schema are frozen by the hashes in `lock.json`.

## 8. Order of events

1. This registration is merged.
2. The two passes run on the test machine (the night of 3 to 4 November). A memory and load sampler runs alongside.
3. Kevin reviews the 12 disputed lines and the optional 10 (4 November).
4. The scoring code is written, committed and frozen. Its hashes are added by amendment.
5. The single scoring run produces the tables over 455 and over 454 lines.
6. The set, the replies and the tables are published together.

## Amendments

### A1. 2026-11-03, recorded after the first pass had started

This amendment records facts about the run and clarifies one sentence. It changes no rule that affects scoring.

1. **Order of events.** This folder was merged at 02:06 UTC on 2026-11-04 (18:06 Pacific on 3 November). Before the merge, one smoke test ran all three models on the public 12-line template set only. Nothing from the blind set had been sent to a model before the merge.
2. **A mechanics check on three real lines.** After the merge, each model ran on the first three lines of the suite file (`w-0001` to `w-0003`) with the placeholder gold, to confirm that the lines finish and the replies parse. All 9 requests finished, none returned an error and all 9 replies parsed. The replies were counted and not read. They are not part of the results.
3. **Start.** The first pass started at 18:10 Pacific on 3 November, from the commit named in section 1. The launcher printed the commit and the suite file's hash before it started, and the hash matched `lock.json`.
4. **What the in-run summaries are for.** The correctness columns in the harness summaries come from the placeholder gold and mean nothing, so they are not reported. The latency, request-error and load figures in the same summaries are real and are used for gate 3. Reply text is read only by the scoring run.
5. **What the memory sampler records.** Every 5 seconds: the resident memory of each Ollama process, the models the server reports as loaded with their sizes, and the one-minute load. Peak resident memory for a model is the largest total resident memory of the Ollama processes while that model is being run. If another job has a different model loaded at the same time, the report says so.
6. **What is shown while the passes run.** A progress display shows the time, the model, the line id and the latency of each request, and a count every 50 lines. It never shows a reply, a line of text or a score.

### A2. 2026-11-03, the first start was aborted and the run restarts from scratch

This amendment records an interruption. It changes no rule that affects scoring.

1. **The first start was aborted** at 18:21 Pacific on 3 November (21:21 Eastern), on the owner's instruction, because the machine was in use. It had started at 18:10 Pacific and had reached the first model of the first pass. The harness was stopped with a termination signal. It wrote its summary marked incomplete, and the launcher stopped the sampler and exited.
2. **No reply was read and nothing was scored.** The only thing looked at was the number of rows in each raw file: 124 replies from the first model, plus the four baselines on all 455 lines, which need no model.
3. **The partial outputs are kept but excluded.** The folder of the first start (raw replies, the incomplete summary, the logs and the memory samples) was moved aside, marked aborted and made read-only. It is excluded from every result, including every latency figure. It is published with the rest of the evidence and labeled as aborted.
4. **The run restarts from scratch** at 00:00 Eastern on 4 November (21:00 Pacific on 3 November). It uses the same commit, the same suite file, the same seeds (20261104 and 20261105), the same models, the same settings and the same launcher as the plan. Nothing carries over from the first start. The seeds fix the order of the models and lines, so the restart repeats the orders the first start used.
5. **How the restart is scheduled.** A small script waits until the start time, logs the load, and then hands over to the registered launcher. The launcher keeps its load gate as registered: while the one-minute load average is above 150, it waits a minute at a time. It checks again before the second pass. The script's hash is in `lock.json` under `inference`.
6. **A new progress log.** The restart writes its progress to a new log, so the log of the first start stays as it was.

### A3. 2026-11-03, the scoring script is frozen

The critical-error counter and the scoring script now exist, and they are frozen before any reply of the restarted run has been read. They carry out sections 2, 3 and 6 and change no rule. This replaces "Not frozen yet" in section 7.

1. **Files.** `src/eval/freshBlind.ts` (the rules, as pure functions) and `scripts/score-fresh-blind.ts` (the command), with 21 offline tests in `src/eval/freshBlind.test.ts` that use made-up lines. Their hashes are in `lock.json` under `scorer`. The command uses scorer v3, the baselines, and the harness's interval and latency functions, and refuses to run if any of those files differs from the pinned hash.
2. **Checks before it scores.** The staged labels, lines and convention sheet, and the review list, against `lock.json`. Every reply's input against the staged line. Both passes marked complete, with no file changed during the run. An existing output folder is refused. A line with no reply stops the scoring.
3. **Line status.** A line is a gate line, a contested line, or a line the six fields cannot hold. A C1 line with a bedtime anchor is a gate line under Kevin's ruling. A C1 line with another anchor stays contested unless the overrides file sets `decisions.c1_other_anchors` to `gate`. A C2 line stays contested.
4. **Critical errors.** As in section 6, choice 2, on gate lines only. The fields counted are the ones the label marks as critical for the first drug among the drug, the dose, the schedule (as the frequency) and the as-needed status. A reply that cannot be read counts as one critical error on a line with a checkable mark. Route is counted as not checkable and reported with its number of lines. The gate is passed when the upper bound of the exact 95 percent interval is at or below 2 percent.
5. **Drug names.** As in section 6, choice 4. The report gives the six-field result with either reading and with the ingredient only.
6. **Gates.** A model passes a gate only if it passes it in both passes. Gate 1 is the critical-error gate. Gate 3 is the latency gate: p95 at or below 10 seconds over every timed request of the reading, failures included, with at least 300 requests, and the first request after warm-up reported separately. The six-field result (gate 2) is reported with its interval. The protocol sets no threshold for it, so none is invented. A model is eligible when it passes gates 1 and 3. Peak resident memory from the sampler is the tiebreak, counted while exactly one model under test is loaded. Samples where a model that is not under test is loaded too are counted and reported.
7. **What is reported.** For each of the two readings and each pass: the gate lines, the contested lines scored both ways, the lines the six fields cannot hold (how many replies could be read), per-category tables with the rules baseline in each, the constant and copy baselines, the number of lines whose answer differed between the passes, how many of the 12 disputed lines Kevin has answered, and a file of every miss on a gate line with its categories and the names of the wrong fields. No line text and no reply text is written.
8. **Kevin's answers.** They enter as a JSON file with `reviewed` (the ids he answered), `lines` (replacement six-field gold for the lines he changed) and `decisions`. The scorer refuses an id that is not in the set. The file's hash is recorded with the results.
9. **The two readings.** Line `w-0193` is one of the lines the six fields cannot hold, so it is not a gate line. The gate results are therefore the same under both readings. Only the number of lines the six fields cannot hold (208 and 207) and the request counts differ.
10. **Checked before the real run.** The command ran end to end on made-up replies built from the real set's gold, with one planted dose error, to prove the plumbing. The planted error was found as the only critical error and the only difference between the passes. Those numbers mean nothing and were not kept.
