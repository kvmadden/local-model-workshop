# Lock note: fresh blind set of medication-instruction lines

Registered on 2026-11-03.

This folder pre-registers the fresh blind test of the three local models on 455 synthetic medication-instruction lines. The protocol it follows is [`docs/FRESH-TEST-PROTOCOL.md`](../../docs/FRESH-TEST-PROTOCOL.md). The set itself is not in this repository. It stays outside, read-only, until the one scoring run. This folder holds hashes (`lock.json`), this note, and the run plan (`RUN-PLAN.md`). No line, no label and no model reply is stored here.

## What is locked

- The staged set was hashed and set read-only at 01:27 UTC on 2026-11-04 (17:27 Pacific on 3 November). It holds 2,686 files. `lock.json` gives the hash of its lock file, the hash of its manifest (which lists every file), and the hash of each deliverable.
- Nothing from the set has been scored. None of the three local models under test had seen a line when it was locked.
- After the lock, a clean JSON copy of the review list was added next to the locked Markdown list, so a form can be built from it. The JSON holds the same items in the same order. The script that wrote it rebuilt the Markdown from the JSON byte for byte, and the original lock still verifies on all 2,686 files. The JSON hash is in `lock.json` under `added_after_lock`.

## The set in numbers

- 455 lines. The six fields can hold 247 of them, and 208 need more than the six fields hold.
- 27 lines are marked contested because their label depends on a convention. 13 depend on C1 (a once-a-day time of day plus "as needed") and 14 depend on C2 (a general mealtime anchor with no count). Each carries its other reading in `alt`.
- 12 lines had a disputed critical field between the two labelers. 10 more lines, which the labelers fully agreed on, form an optional spot check.
- The dedupe rule (Jaccard 0.7 against the development and template lines, 37 lines compared) dropped 4 lines before labeling.

## Disclosures that go into every report that uses this set

1. **One label reply was printed before the lock.** While diagnosing a bug in the reply reader, the coordinating Claude session printed most of one Gemini label reply. It is the label for line `w-0193` (label id W-82544). Every result is therefore reported twice, once over all 455 lines and once over the 454 lines without `w-0193`.
2. **A Claude agent wrote the convention sheet.** The agent that built the set wrote the sheet on 2026-11-03 and froze it before any line was written or labeled. Its worked examples use invented drug names. Grok and Gemini each reviewed a draft for ambiguity before it was frozen. The staged amendment file says "the coordinator" where it should say "the build agent". Both are Claude agents, and the amendment file is locked, so the correction is made here.
3. **What the build agent read.** It read these repository files by eye before labeling: `eval/sig-extraction/schema.json` (the six-field vocabularies), `src/eval/sigScore.ts` and `src/eval/sigScoreV3.ts` (field formats and normalization). The development and template lines were read only by scripts that printed counts and ids. No development line, and no line or label of this set, was printed or quoted by the build agent. After the lock it also read the eval harness, the prompt, the schema and the protocol to write the run plan. It read no model reply.
4. **Kevin's review is not in yet.** The 12 disputed lines and the optional 10 have not been answered. Kevin reviews them on 4 November, before the scoring run. Any label he overturns is applied before that run.
5. **Kevin's ruling of 3 November on the C1 convention.** "At bedtime as needed" means no fixed schedule, as needed, at most once a day. The suite file sets `conventions.bedtimeAsNeeded` to `no-schedule`. This settles the 7 C1 lines that use a bedtime anchor. The other 6 C1 lines use a morning or an evening anchor, and the ruling names bedtime only, so they stay contested until Kevin says whether the same reading holds. The 14 C2 lines are a project choice with no ruling pending, and they stay contested.

## Limits of the set

- 109 lines have a Grok label and no Gemini label. They are not in the set. `RUN-PLAN.md` says why.
- Before adjudication, the two labelers agreed on at least 98.4 percent of every label field (the lowest is dose magnitude, 495 of 503 drug entries). The exception is the exact set of category tags, on which they agreed on 62.4 percent. The final tags are decided by majority between the writer's claim and the two labelers. The staged lock note says 99 percent or more for every critical field. The correct lowest figure is 98.4 percent, and the staged note is locked, so the correction is made here.
- The lines were written to have one clear answer under a detailed sheet, so high agreement describes the set and says less about real-world difficulty.
- The two top-up writing rounds (162 lines) were written by Grok only. The first round (406 lines) was written by both families, each covering every category.
- The six-field projection, representability and the critical-field marks are computed by rule from the final full-target label. The rule-derived six-field projections of the two labelers are equal on 245 of the 247 lines that both call representable, and the two labelers agree on representability for 454 of 455 lines.
- Every line is synthetic. No openFDA text was used.
