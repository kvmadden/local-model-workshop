# Sig bench: 120 hard medication instructions (proposed labels)

**Status: v1 labels are all PROPOSED. v2 has 22 confirmed, 27 from Kevin's notes and 71 proposed.** Claude wrote the 120 lines and proposed a label for each one. On 13 November Kevin Madden, PharmD, reviewed 49 of them, and his review shaped v2 (see [Version 2](#version-2-e-prescription-input-and-two-tier-labels) below). No label here is ground truth until he confirms it, and every score against a proposed label is a score against a proposal.

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

## Version 2: e-prescription input and two-tier labels

Kevin reviewed 49 of the 120 v1 labels on 13 November 2026. He marked 22 correct and 27 "Should be flagged", and left notes on 19. His notes are the requirements for v2. v1 stays as it was: `items.jsonl`, `schema.json` and the v1 scorer are unchanged, and so are the frozen rules parser and scorer v3.

### What changed

- **Input like an e-prescription.** Each item has a drug field, a strength, a dosage form, the sig, a quantity and a days supply ("Sig is usually written in a field separate from drug and dose"). The quantity and days supply let a reader do the division. On a clear line they agree with the reading, and a check proves it by arithmetic on 96 of the 120 items. On an unclear line `quantity_role` says whether they point to one reading (`supports_one_reading`) or leave the question open (`leaves_ambiguous`), and `quantity_math` shows the sum.
- **Dose as a range** `{min, max, unit}`, with a separate **quantity per dose** in the unit the patient counts (tab, cap, mL, gtt, puff, spray, unit, application, patch, supp). A fixed dose has min equal to max. This holds 1/2 to 1 tab, i to ii tabs and 10 to 20 mL.
- **Concentration** for liquids, solutions, inhalers and sprays (100 mg/5 mL, 0.5%, 90 mcg per puff), so a volume converts to a mass. The scorer reads 0.5% and 5 mg/mL as the same.
- **A weekly pattern** (`weekly_schedule`, a dose for each weekday) apart from **steps in time** (`phases`). Warfarin with a half tablet on Tuesday and Friday is a weekly pattern, never "then".
- **Limits:** a daily maximum, at most N doses a day, at most N doses in a window (nitroglycerin, 3 in 15 minutes) and at most N repeats.
- **Form and package** (multidose or unit dose) where the line or the product says so, and an **application amount** for topicals (`thin_layer`, or a ribbon with its length).
- **Two tiers.** `flag` says whether the line needs a call to the prescriber, with reasons. `likely_reading` is what a careful pharmacist would act on, with a `basis` (each entry names its source: the sig, the input fields, Kevin's note or pharmacy knowledge) and a `confidence`. A line can be flagged and still have a likely reading: metoprolol tartrate "qd bid" is flagged, and its likely reading is twice daily. `safety_notes` sit apart from both, such as acetaminophen with no 4 g a day cap.

### Label status

| Status | Items | Meaning |
|---|---|---|
| `confirmed` | 22 | Kevin marked the v1 label correct. v2 maps it into the new shape. |
| `kevin-notes` | 27 | Kevin marked the line "Should be flagged". The flag is set, and the likely reading and safety notes follow his note where he wrote one. |
| `proposed` | 71 | Not reviewed yet. |

Eight of the held lines (sb-063, sb-064, sb-073, sb-076, sb-078, sb-079, sb-080, sb-083) carry notes about the label rather than a reason to call the prescriber, for example "Why you say then?" or "Variable dose?". They keep the flag his tap asked for, with the reason `reviewer_hold` where no clinical reason was given, and the confirmation sheet asks whether the flag stands. `reviewer_hold` is left out of reason recall.

### Files

| File | What it holds | Edited by hand |
|---|---|---|
| `items-v2.jsonl` | The 120 items in v2 shape, with `input`, `label`, `label_status`, Kevin's `review`, and `open_questions` (what v2 adds that his review did not decide) | Yes, the only source |
| `schema-v2.json` | The reply format (the label has the same shape) and the item format | Yes |
| `review/kevin-2026-11-13.json` | Kevin's saved review: verdict and note per line | No, his record |
| `confirm-v2.json` | Only what Kevin still needs to see: the 71 unreviewed lines and 18 reviewed lines where v2 adds something new, held lines with a likely reading first, each with `what_changed` | No, generated |
| `CLARIFICATION-RULES.md` | 51 cited rules (law, standards, judgment) and the appendix that maps each flag reason to a tier and rule IDs | Yes, the source of every `clarify` block |
| `results/rules-v2.json` | The rules parser in v2 shape, scored on all three tiers | No, generated |

`npm run bench:sig:v2` checks the items and regenerates the two generated files. `npm run bench:sig:v2 -- --check` fails if either is out of date. The checks include: the label status matches the saved review, every held line is flagged, a basis cites Kevin only where he wrote a note, and the quantity fits the reading.

### Scoring

- **Flag**, on all 120 items: the reply's `flag.needed` against the label. Reason recall is reported beside it and does not change the verdict.
- **Likely reading**, on the 113 items whose label has one: every field compared with the label. Mass units convert, a range must match at both ends, weekday patterns may come in any order, and a null field wants a null reply. Basis and confidence are recorded, not scored.
- The two tiers are scored separately, so a reply can get the flag right and the reading wrong. A likely reading offered where the label has none is counted, not scored.
- **Clarification tier**, on the 20 flagged items whose label names a tier: the reply's `clarify.tier` against the label. It does not change the flag or reading verdicts.

### Clarification tier

What a pharmacist would dispense can differ from what law or a standard requires before dispensing. So every flagged item has a `clarify` block: `tier` is the strictest primary tier among its flag reasons (law, then standard, then judgment), and `rule_ids` lists the rules behind them. Both come from the appendix of `CLARIFICATION-RULES.md`, and the item check fails if a block differs from that table. Unflagged items have no block. The tiers are an inferred reading of the cited rules with Florida as the baseline, not a legal ruling.

| Law | Standard | Judgment | No tier |
|---|---|---|---|
| 17 | 1 | 2 | 7 |

- **No tier** is the seven `reviewer_hold` lines. The table gives that reason no tier, so they are not scored on this tier.
- **One reason has two tiers.** Dosage form unspecified is judgment for a non-controlled drug and law for a controlled one. Both items with that reason (sb-043, sb-044) are non-controlled, and their other reasons are law anyway.
- **11 items have a likely reading and a law or standard tier.** A pharmacist might act on the reading, and the guess may well be right (metoprolol twice daily, digoxin in mcg), but a call is still required first. A reply that does not flag one of these has dispensed its best guess, and the report counts it as wrong even when the guess is right.

### The rules parser on v2

The frozen parser is unchanged. A wrapper (`src/eval/sigBaselinesV2.ts`) puts its six fields into a v2 likely reading, copies the dosage form field, reads one count per dose, and flags on plain patterns: a blank drug or strength field, "ud" or "as directed", no schedule, two schedule words, or two durations. It knows no drug norms or maximum doses, and it never fills route, concentration, limits, phases or weekly patterns. It is the floor.

| Items | Flag right | Flagged lines caught | Clear lines flagged | Reading all right | Reading fields right |
|---|---|---|---|---|---|
| Clean | 32 of 34 | 0 of 0 | 2 of 34 | 0 of 34 | 720 of 782 |
| Hard | 51 of 86 | 11 of 27 | 19 of 59 | 0 of 79 | 1544 of 1817 |
| Reviewed by Kevin | 26 of 49 | 11 of 27 | 7 of 22 | 0 of 42 | 795 of 966 |
| All | 83 of 120 | 11 of 27 | 21 of 93 | 0 of 113 | 2264 of 2599 |

- **No reading is all right**, because the wrapper never fills route. That is by design, not a finding about the parser.
- **The field count flatters it.** Most fields are null on most lines, and a null reply to a null field counts as right. The fields that carry the content are lower: across the 113 readings, dose 83, quantity 89, frequency 72 and route 1.
- **Its flags are patterns, not judgment.** It catches two schedule words, two durations, "ud" and blank fields. It misses every flag that needs knowledge (methotrexate daily, digoxin in mg, metformin over its maximum, acetaminophen with no cap) and every reviewer hold. It flags tapers and weekly regimens it cannot read.
- **It names no tier, so it gets 0 of 20 on the clarification tier.** Of the 11 items with a likely reading and a law or standard tier, it dispensed without a call on 5 of the 11.
- **This is not a result.** 71 labels are still proposed, and the same family wrote the lines, the labels, the scorer and the wrapper.
