# Data card: 25 synthetic medication lines (development data)

## What it is

- `cases.jsonl`: 25 synthetic instruction lines, one drug each. Every line starts with the drug name and strength, and lines are 36 to 96 characters long. Tags: arithmetic 12, abbreviation 8, as-needed 7, plain 4, liquid 2. One line can carry several tags.
- `gold.jsonl`: labels for the split format (drug, dose per administration, frequency, timing, as-needed use, reason). The first-format labels are kept in `eval/results/archive/schema-v1/gold.jsonl`.
- `prompt.txt` and `schema.json`: the split-format prompt and JSON schema.
- `models.json`: the three models and settings used on 2026-10-30.

These files are hash-locked evidence (`eval/extraction-audit/historical-hashes.json`) and do not change.

## Status: development data

- **Format revised on these lines.** The split format, its prompt and its labels were written after the first-format runs on these same lines.
- **Prompt mirrors the lines.** The prompt spells out the constructs of 17 of the 25 lines and gives worked arithmetic that mirrors s04, s07 and s21.
- **Rules match the models.** A deterministic rules parser (`src/eval/sigBaselines.ts`) gets every field right on all 25 lines.

Use these lines to develop and to catch regressions. A headline number needs the fresh locked set in [docs/FRESH-TEST-PROTOCOL.md](../../docs/FRESH-TEST-PROTOCOL.md).

## Label conventions

- **A dose tied to one time of day is `once_daily`.** This covers qAM, QHS, every morning, every evening and at bedtime.
- **Contested: "at bedtime as needed" (s25) is labeled `once_daily`.** The extraction audit protocol in this repository takes the opposite rule, that a bedtime anchor is not a schedule. The model ranking depends on this one label ([docs/DEVELOPMENT-RESULTS.md](../../docs/DEVELOPMENT-RESULTS.md)). It is listed for a pharmacist's decision in [docs/KEVIN-REVIEW.md](../../docs/KEVIN-REVIEW.md).
- **`frequency` means two things.** On scheduled lines it is a schedule. On as-needed lines with an interval ("every 6 hours as needed") it is a maximum rate. The fresh protocol separates them.
- **"every 12 hours" is `every_12_hours`, not `twice_daily`.**
- **Bedtime without "daily" is `once_daily`.** Insulin glargine at bedtime (s11) is labeled this way.

## What is not scored

- No field holds route, duration, daily maximum, day of week or administration conditions.
- Six lines contain one of these (s04, s05, s10, s12, s13, s19), as the rules parser reports. A model can drop "x 7 days" or "max 10 tabs/day" and still score all fields right.

## Scoring

- **Historical verdicts.** The v2 scorer (`src/eval/sigScore.ts`) produced the committed verdicts.
- **New runs.** Scorer v3 (`src/eval/sigScoreV3.ts`) is the default. It gives the same verdicts on every saved reply (`src/eval/evidenceRescore.test.ts`).
