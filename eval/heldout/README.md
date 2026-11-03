# Data card: 12 template lines (development data, not a holdout)

## What it is

`frozen.json` holds 12 synthetic lines made by `scripts/generate-holdout.mjs` from a fixed seed. Each line has labels for the first format (`v1`) and the split format (`v2`).

The generator fills six fixed instruction templates, each used twice. Each copy gets a made-up drug name (fictalfa to fictlima) and one of four strengths (4, 8, 12 or 20 mg). Every line is "N mg tablets, take ...". There are no liquids, inhalers, insulin, mcg doses or weekly lines.

| Template | Taken from development line |
|---|---|
| take 2 tablets by mouth tid prn itching | s24, the line that sank qwen3.8:27b under the first format |
| take half a tablet at bedtime as needed for sleep | s25, the line that decides the pick under the split format |
| take 1 tablet every 12 hours | s17, every word |
| take 1 tablet every morning | s05 and s17 |
| take 2 tablets twice daily with meals | s03, every word |
| take 1 tablet as needed for nausea | s15 without the interval |

## Status: development data

- **Frozen before its runs.** The set was committed in `1b528e3` on 2026-10-31, before its runs on 2026-11-01. That makes it a prospective regression check.
- **Not independent.** It was written after the first-format misses were known, by copying the development lines that caused them, so it cannot measure generalization.
- **Small.** The effective sample is about six templates.
- **Rules match the models.** The rules parser gets every field right on all 12 lines.

`src/eval/holdout.test.ts` checks that the generator reproduces the file byte for byte. Its "disjoint" check only confirms that no line is the same string as a development line.

The folder and run names (`heldout-v1`, `heldout-v2`, "heldout-seed-20261031") stay because they are locked evidence. The eval CLI calls this suite `templates12`, and still accepts `--heldout`.
