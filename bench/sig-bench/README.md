# Sig bench: 120 hard medication instructions (proposed labels)

**Status: every label is PROPOSED and unconfirmed.** Claude wrote the 120 lines and proposed a label for each one. Kevin Madden, PharmD, has not reviewed them yet. No label here is ground truth until he confirms it, and every score against these labels is a score against a proposal.

## What it is for

The development sets are too easy to decide anything. A short rules parser gets every field right on all 25 development lines and all 12 template lines. This bench adds what real e-prescriptions and pharmacy labels hold:

- dense abbreviations (qd, bid, tid, qid, qhs, qam, qpm, ac, pc, prn, ud, OD, OS, OU, SL, PR)
- tapers and other phased regimens, including weekday-dependent doses
- daily maximums, dose ranges and interval ranges
- as-needed use with a reason, an interval or a daily limit
- routes other than by mouth, with left, right or both eyes and ears
- durations, weekly and monthly regimens, every other day
- split tablets, liquids, insulin sliding scales written out in full
- 18 lines (15%) where the right answer is to ask the prescriber, not to guess

It is the "sig bench" for a pharmacist-in-the-loop eval lab. Models run on it only after Kevin confirms the labels, on an idle machine.

## How it relates to the fresh blind set

It does not replace the fresh blind set in `eval/fresh-blind-set/`, and it is not blind.

- Claude wrote these lines. Claude also wrote the scorer and the rules parser, and read the development lines while building them. The fresh protocol forbids all of that for a blind set.
- The bench is development data for the eval lab. A headline result still needs the locked fresh set.
- No line was compared with the fresh set, which is kept outside this repository. A check does compare every line with the 37 development and template lines, using the protocol's dedupe rule (word Jaccard 0.7). No line reaches it.

## Files

| File | What it holds | Edited by hand |
|---|---|---|
| `items.jsonl` | The 120 lines, each with `tier`, `categories`, `label_status: "proposed"`, the proposed `label` and a `note` for Kevin | Yes, the only source |
| `schema.json` | The label and reply format | Yes |
| `confirm.csv` | The sheet Kevin fills in | No, generated |
| `suite-six-field.json` | The 67 lines the six fields can hold, with six-field gold, for `npm run eval -- --suite` | No, generated |
| `results/rules-proposed.json` | The frozen rules parser, scored against the proposed labels | No, generated |

`npm run bench:sig` checks the items and regenerates the three generated files. `npm run bench:sig -- --check` fails if any of them is out of date. A unit test does the same.

## Tiers

- **Clean (34 lines).** One drug, one fixed dose, one schedule or one as-needed rate, and every fact on the line fits the six fields. Common abbreviations are allowed.
- **Hard (86 lines).** Everything else, including the 18 lines that need clarification.

## The label format

The first six fields are the six fields of `eval/sig-extraction/schema.json`, with the same names and values. The six fields cannot hold a taper, a range, a cap, a route or a "needs clarification" answer, so the format adds these fields:

- `route` and `laterality` (left, right or both)
- `dose_high`, the top of a dose range. `dose_per_administration` then holds the bottom.
- `prn_interval`, the shortest and longest time between as-needed doses, in hours or minutes
- `max_doses_per_day` and `max_daily_dose`
- `duration_days` and `days_of_week`
- `phases`, the steps of a taper or the doses of a weekday regimen
- `sliding_scale`, each glucose band and its insulin units
- `needs_clarification` and `clarification_reason`

The dose units add mEq, drop and patch. The frequencies add every other day, every 72 hours, twice weekly and once monthly. A line that uses one of these, or a range, phases or a sliding scale, is not representable in the six fields.

## Conventions Kevin should check

These are proposals. The confirmation sheet shows each one on the lines it touches.

1. **As-needed rates are not schedules.** This follows Kevin's ruling of 3 November 2026: the six-field `frequency` holds a schedule only. So "q6h prn pain" has frequency null and an interval of 6 hours, "tid prn" has frequency null and at most 3 doses a day, and "qhs prn" has frequency null, timing bedtime and at most 1 dose a day. The column `frequency_prompt_reading` gives the frozen prompt's reading, where the rate is the frequency.
2. **Route from the dosage form.** When a tablet or capsule line names no route, the route is oral (R1).
3. **Salt or release form in the drug name** only when it makes a different product: metoprolol succinate and tartrate, metformin ER, fluticasone propionate. Otherwise the gold is the ingredient, and scorer v3 still accepts a salt the line itself names.
4. **Meal words.** "Before breakfast" is proposed as before meals and "with food" as with meals. Either could be read as a time of day instead.
5. **Abbreviated names and reasons.** The gold is the full name (acetaminophen, hydrochlorothiazide, shortness of breath). The written form (APAP, HCTZ, SOB) also counts and is listed under `also_accepted`.
6. **When "as directed" is fine.** A dose pack, emergency glucagon and a patch sig that ends in "as directed" are proposed as not needing clarification. "Take as directed" with no dose or no schedule does need it.
7. **The ISMP "u" for units** (sb-120) is proposed as 8 units without a flag. Kevin may prefer to flag it.

## How to confirm

Open `confirm.csv`. The lines that need clarification come first, then the tapers, then the other hard lines, then the clean ones. For each row, write in the `kevin` column:

- `ok` when the proposed label is right
- the corrections as `field=value` (for example `timing=morning`) when it is not
- `flag` when the line should need clarification, or `unflag` when it should not

No script reads the sheet back yet. When it does, a confirmed item changes `label_status` to `confirmed`, and the generated files are rebuilt.

## The rules parser against the proposed labels

The frozen rules parser (`src/eval/sigBaselines.ts`) was run over all 120 lines with no model. It writes only the six fields, so it is scored on the 67 lines the six fields can hold, with scorer v3. The numbers below come from `results/rules-proposed.json`, and a test checks them.

| Tier | Six fields all right, under the ruling | Under the prompt reading |
|---|---|---|
| Clean | 23 of 34 | 27 of 34 |
| Hard, representable | 15 of 33 | 20 of 33 |

- **Most clean misses are the as-needed convention.** Under the frozen prompt's reading the parser gains 4 clean lines. The rest are phrasing it never saw, such as "four times a day", "qpm", "ac" as a timing and "per nostril".
- **The 53 lines it cannot represent** include all 18 that need clarification. It cannot say "needs clarification". The only signal it has is words it could not read: it left words unread on 12 of the 18 clarification lines, but also on 9 of the 34 clean lines, so that signal is not a flag.
- **The drug as written counts.** On one hard line (HCTZ) the drug is right only because the written form is accepted. On the ingredient alone, the hard count is 14 of 33.
- **This is not a result.** The labels are proposed, and the same family wrote the lines, the labels and the parser.
