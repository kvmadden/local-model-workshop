# Rx Intake Check: label conventions

Written 13 November 2026, before the development set, the held-out set or the system existed. Both new sets are labeled by this sheet. The system is built to the same sheet, so a score says how well the system follows these conventions on lines it has not seen, not whether the conventions are right.

Sources: the tier appendix of `bench/sig-bench/CLARIFICATION-RULES.md` (tiers and rule IDs), Kevin Madden's review of 13 November 2026 (marked **Kevin**), his 3 November ruling on "at bedtime as needed", FDA labels on DailyMed, RxNorm (NLM), and the ISMP List of Error-Prone Abbreviations (2024). Where none of those decides a case, the sheet says so and marks the choice **convention**.

## Input

An e-prescription: drug, strength, dosage form, sig, quantity with its unit, and days supply. Any of drug, strength and dosage form can be blank.

## Label

```json
{
  "flag": { "needed": true, "reasons": ["exceeds_usual_max"] },
  "tier": "law",
  "basis": [
    { "reason": "exceeds_usual_max", "kind": "fda_max", "fact": "2 tablets of 1000 mg twice daily is 4000 mg a day. The label maximum is 2000 mg a day.", "citation": "DailyMed: metformin hydrochloride extended-release tablets, Dosage and Administration" }
  ],
  "judgment_only": false
}
```

- `flag.needed` is true when at least one reason below fires. `reasons` is empty exactly when it is false.
- `tier` is the strictest tier among the reasons (law, then standard, then judgment), from the table below. Null when not flagged.
- Every reason has a `basis` entry. `kind` is one of: `missing_element`, `structure`, `arithmetic`, `fda_max`, `unit_strength`, `weekly_product`, `controlled_schedule`, `ismp`, `judgment`. `fact` states the checkable fact. `citation` names its source.
- `judgment_only` is true when every reason is judgment tier. Those lines are scored apart from the rest.
- A **required call** is a line whose tier is law or standard. Dispensing one without a call is a **dangerous dispense**.

## Reasons, tiers and triggers

| Reason | Tier | Fires when | Basis kind |
|---|---|---|---|
| missing_drug | law | The drug field is blank | missing_element |
| missing_strength | law | The strength field is blank and the sig does not state the strength | missing_element |
| missing_dose | law | Neither the sig nor the fields give how much to take each time | missing_element |
| missing_frequency | law | The sig gives no schedule, interval or as-needed use, and it is not a single dose | missing_element |
| missing_laterality | law | An eye or ear product with no eye or ear named (left, right, both, or affected) | missing_element |
| missing_taper_steps | law | The sig says to taper, or "then taper", without the steps | structure |
| missing_titration_plan | law | The sig says to increase, titrate or adjust without the step, interval or ceiling | structure |
| missing_sliding_scale | law | The sig refers to a sliding scale or correction scale without writing it | structure |
| as_directed_without_instructions | law | "As directed" or "ud" and the dose or the schedule is missing | missing_element |
| conflicting_frequency | law | Two schedules for the same dose that cannot both hold ("daily bid") | structure |
| conflicting_duration | law | Two durations for the same step ("x 5 days x 10 days") | structure |
| alternatives_without_rule | law | Two choices of dose, schedule or regimen joined by "or" with no rule for which to use | structure |
| implausible_dose_unit | law | The written strength does not exist for that drug and form in that unit (RxNorm), but the 1000-fold unit swap does ("125 mg" digoxin, marketed as 0.125 mg) | unit_strength |
| exceeds_usual_max | law | The fixed daily total, or a written daily maximum, is above the maximum adult daily dose in the FDA label for that product | fda_max |
| frequency_product_mismatch | law | A product whose FDA label doses it only weekly or monthly is written with a daily schedule | weekly_product |
| missing_max_daily | standard | As-needed use with an interval and no written daily maximum, where the dose times the most doses the interval allows in 24 hours is above the FDA label maximum (2 tablets of 500 mg every 4 hours allows 6,000 mg against a 4,000 mg label maximum) | fda_max |
| error_prone_abbreviation | standard | A dose designation on the ISMP Do Not Use list: "U" or "IU" for units, a trailing zero ("5.0 mg"), a naked decimal (".5 mg"), or "µg". Also any ISMP-listed abbreviation that leaves the site or schedule genuinely unclear in context | ismp |
| dosage_form_unspecified | judgment, or law for a controlled substance | The dosage form field is blank and the sig does not make the form clear. Law when RxNorm gives the drug a DEA schedule (21 CFR 1306.05(a)) | missing_element or controlled_schedule |
| package_unspecified | judgment | An eye drop solution sold in both multidose bottles and single-use vials, with no package stated (**Kevin**, timolol) | judgment |
| internal_conflict | judgment | Two written parts of the sig disagree but the stricter one can be followed (a repeat limit below the written maximum, **Kevin**, sumatriptan), or, for tablets, capsules, patches and suppositories on a fixed schedule, quantity and days supply differ from a clear sig by more than a factor of 2 with no product rule to explain it | arithmetic or judgment |

Rule IDs per reason are the ones in the appendix of `CLARIFICATION-RULES.md`.

## Not a reason to call

- **Ranges** of dose, count or interval: "1 to 2 tabs", "1/2 to 1 tab", "10 to 20 mL", "i to ii tabs", "every 4 to 6 hours" (**Kevin**, reviewed lines held only to fix the label shape).
- **Common abbreviations** qd, daily, bid, tid, qid, qhs, qam, qpm, prn, po, SL, ac, pc, OU and AU when the meaning is clear (**Kevin** confirmed lines written with qd, QHS and OU). They can earn a safety note, not a call.
- **Weekday patterns** ("1 tab daily except 1/2 tab on Tue and Fri") and written tapers with every step.
- **"As directed"** next to a full dose and schedule (NCPDP-SIG-AS-DIRECTED-WITH-DOSE), and a dose pack "as directed on package" (**Kevin** confirmed).
- **"At bedtime as needed"**: as needed, at most once a day (**Kevin**, 3 November).
- **As-needed use with no written maximum** when the most the interval allows stays at or under the label maximum, or the label gives no maximum (**Kevin** confirmed hydromorphone 1 to 2 tabs every 4 hours as needed).
- **High doses at or under the label maximum.**
- A topical "apply a thin layer to the affected area" with a schedule.
- Quantity and days supply that agree with the sig within a factor of 2, as-needed lines whose quantity is below the most they allow, and liquids, inhalers, pens and other packaged products, whose package sizes rarely match the sig.

## Facts must be checkable

- `fda_max` and `weekly_product` facts come from the product's FDA label on DailyMed, Dosage and Administration section, for the same release form (immediate or extended release).
- `unit_strength` and `controlled_schedule` facts come from RxNorm (rxnav.nlm.nih.gov).
- `arithmetic` facts show the sum: dose per administration, times a day, days supply, quantity.
- A line whose only basis is `judgment` is `judgment_only`.
