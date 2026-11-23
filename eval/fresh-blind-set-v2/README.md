# Fresh blind set v2 (not locked, awaiting adjudication)

This folder rebuilds the fresh blind test set under `docs/FRESH-TEST-PROTOCOL.md`, unchanged. The first set's text was lost (see `../fresh-blind-set/AMENDMENT-2026-11-23.md`). Nothing here is locked yet, and no model has been run on any line. Locking comes after Kevin adjudicates every disagreement.

## State

| Step | State |
|---|---|
| Convention sheet frozen and committed before any line was written | done (its own commit) |
| Lines written by two non-Claude families | done, 446 written |
| Dedupe at Jaccard 0.7 against development and template lines | done, 13 dropped, 433 kept |
| Two blind labels per line | done, 433 of 433 by both |
| Agreement per field | done, `agreement.md` |
| Kevin's adjudication | open: 219 items on 127 lines, `adjudication-form.html` |
| Lock, manifest, tag | not started |
| Any model run | none, by rule |

## Files

- `convention-sheet.md`: frozen before writing. SHA-256 `443ad6421e46d47edc3aff61c9c09c1f234b184e9b1fd54dc43a3f300b290e8e`.
- `lines-written.jsonl`: every line written, with its writer family and claimed categories, before dedupe.
- `dedupe-record.json`: the rule, the counts and every dropped line with its highest Jaccard score and the id it matched.
- `lines.jsonl`: the 433 lines kept.
- `labels-openai.jsonl`, `labels-google.jsonl`: the two raw label sets, untouched.
- `agreement.json`, `agreement.md`: per-field percent agreement and Cohen's kappa with denominators.
- `disagreements.json`: every disagreement as line, field, label A and label B.
- `adjudication-form.html`: one form with every disagreement. Labelers are shown as A and B. No model output appears. Answers download as JSON.
- `category-counts.json`: lines per category, per writer.
- `../../scripts/fresh-blind-v2.mjs`: the build script (assemble, dedupe, batches, collect, agreement, form).

## Who did what

- **Writers.** OpenAI (Codex CLI, its default model) and Google (Gemini 3.8 Flash, High, through the Antigravity CLI), both on subscription pools. Each got only the protocol's set specification and the convention sheet, ran in an empty folder, and was told not to open files or run commands. The Codex logs show no tool calls. The Antigravity runs printed only their answers and logged nothing else. First round: 8 lines per category from each family. A top-up round of 4 lines per category for categories 8 to 11 and 17 to 22 brought every category to at least 20 after dedupe. OpenAI wrote 217 kept lines, Google 216.
- **Labelers.** The same two families, each labeling all 433 lines in batches of 25, blind to the other's labels and to any model output. Each labeler therefore also labeled the lines it wrote. That is disclosed here because it may raise agreement on those lines.
- **Coordinator.** A Claude session wrote the convention sheet, the build script and this note. It read `eval/sig-extraction/schema.json` and searched `src/eval/sigScoreV3.ts` for field formats. The development and template lines were read only by the dedupe script, which printed counts and ids, never text. While checking the agreement script on the first batch of 25 lines, the coordinator viewed 13 disagreement items for those lines (field names and both labels). It did not use them to change any label.

## Coverage

433 lines, 22 to 214 characters. Categories are the writer's claim. One line can count toward several.

| Cat | Lines | Cat | Lines | Cat | Lines | Cat | Lines |
|---|---|---|---|---|---|---|---|
| 1 | 258 | 7 | 139 | 13 | 38 | 19 | 27 |
| 2 | 100 | 8 | 26 | 14 | 65 | 20 | 30 |
| 3 | 153 | 9 | 30 | 15 | 73 | 21 | 28 |
| 4 | 32 | 10 | 25 | 16 | 98 | 22 | 25 |
| 5 | 103 | 11 | 34 | 17 | 26 | 23 | 101 |
| 6 | 26 | 12 | 28 | 18 | 25 | | |

## How agreement is compared

Drug entries are compared one by one in the order labeled. Strings are compared lowercased and trimmed. As-needed reasons are compared on letters and digits. Conditions are free text, so they are compared by type and by the numbers they hold (thresholds and doses), and the form shows both labelers' own wording. Two lines match rule C7 (a morning or evening anchor with "as needed") and are candidates for `contested: true`.

## Next

1. Kevin fills in `adjudication-form.html` and downloads the answers.
2. The answers are applied to make `labels-adjudicated.jsonl`. Both raw sets stay as they are.
3. The full-target scorer is written and frozen, then the lock commit adds the manifest and hashes, and the commit is tagged. Only then may any model run.
