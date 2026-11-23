# Convention sheet, fresh blind set v2

Frozen on 2026-11-23, before any line of set v2 was written or labeled. It applies `docs/FRESH-TEST-PROTOCOL.md`. Writers and labelers get this sheet and the protocol's set specification, nothing else from the repository. Every worked example uses invented drug names (zorvalol, pimetrexin, and so on) so the sheet leaks no real line.

## 0. Kevin's two rulings of 3 November 2026 (binding)

- **R1. At bedtime as needed** means no fixed schedule, as needed, and at most once a day. Full target: `schedule` null, `anchors` ["bedtime"], `as_needed` true, `max_dose_per_period` one dose per 1 day. Six-field projection: frequency null, timing "bedtime", prn true. The suite file sets `conventions.bedtimeAsNeeded` to `no-schedule`.
- **R2. The schedule and the as-needed maximum are separate fields.** A schedule goes in `schedule`. An as-needed limit goes in `max_dose_per_period` or `prn_min_interval_h`, never in both. In the six-field projection `frequency` holds a schedule only, so an as-needed line with no schedule has frequency null. Its limit is scored in the full target only.

## 1. Conventions this sheet settles

- **C1. Frequency words on an as-needed line are limits, not a schedule** (follows from R2). "Every 6 hours as needed" gives `schedule` null and `prn_min_interval_h` 6, six-field frequency null. "Twice daily as needed" gives `schedule` null and `max_dose_per_period` 2 doses per 1 day, six-field frequency null.
- **C2. q12h is not BID.** "BID", "twice daily", "twice a day", "2 times daily" give count 2 per 1 day with no interval, six-field `twice_daily`. "q12h", "every 12 hours" give count 1 per 12 hours, six-field `every_12_hours`. The same split holds for TID vs q8h and QID vs q6h. Label what is written, never convert one into the other.
- **C3. "Daily" and "every 24 hours" are the same.** "Daily", "once daily", "once a day", "every day", "qd", "q24h", "every 24 hours" all give count 1 per 1 day and six-field `once_daily`.
- **C4. Ranges.** A dose range ("1 to 2 tablets", "1-2 tabs", "one or two", "1 or 2") is a range with `low` and `high`, never a single value. An interval range ("every 4 to 6 hours", "q4-6h") on a scheduled line gives `min_interval_h` 4 and `max_interval_h` 6. On an as-needed line it gives `prn_min_interval_h` equal to the lower bound. Any dose range, and any interval range on a scheduled line, makes the line not six-field representable.
- **C5. A single time-of-day anchor with no other count means once a day.** "At bedtime", "every morning", "qhs", "qam" on a scheduled line give count 1 per 1 day with that anchor (six-field `once_daily` plus the timing).
- **C6. Never invent a count from a meal anchor.** "With meals" with no count gives `schedule` null, `anchors` ["with_meals"], six-field frequency null and timing `with_meals`. "Three times daily with meals" gives count 3 per 1 day plus the anchor.
- **C7. Contested, scored both ways.** A morning or evening anchor plus "as needed" ("every morning as needed") is labeled by analogy with R1 (no schedule, anchor, as needed, max one per day). Kevin ruled on bedtime only, so these lines are tagged `contested: true` with the other reading (six-field `once_daily`) in `alt`.

## 2. Full target (one JSON object per line)

```
{ "id": "...",
  "meds": [ {
    "drug_text": "as written, or null",
    "ingredient": "lowercase generic name, or null if no drug is named",
    "salt_or_release": "lowercase, only if written: e.g. 'tartrate', 'succinate er', 'er', 'dr', 'hcl', else null",
    "status": "active | stopped | held | negated",
    "dose": { "value": n|null, "low": n|null, "high": n|null, "unit": "mg|mcg|g|mL|U|mEq|null" } | null,
    "form_quantity": { "value": n|null, "low": n|null, "high": n|null, "form": "tablet|capsule|puff|spray|drop|patch|mL|application|suppository|..." } | null,
    "dose_basis": "per_kg | per_m2 | null",
    "route": "oral|sublingual|buccal|inhaled|nasal|ophthalmic|otic|transdermal|topical|subcutaneous|intramuscular|intravenous|rectal|vaginal|null",
    "schedule": { "count": n, "period": n, "period_unit": "h|d|wk", "min_interval_h": n|null, "max_interval_h": n|null, "days_of_week": ["mon",...]|null } | null,
    "anchors": ["bedtime"|"morning"|"evening"|"with_meals"|"before_meals"|"after_meals"|"before_breakfast"|"noon"|...] | null,
    "as_needed": true|false,
    "as_needed_reason": "short lowercase English phrase, or null",
    "max_dose_per_period": { "value": n, "unit": "mg|g|tablet|dose|...", "period": n, "period_unit": "h|d" } | null,
    "prn_min_interval_h": n|null,
    "duration": { "value": n, "unit": "d|wk|mo" } | null,
    "phases": [ { "dose": {...}, "form_quantity": {...}, "schedule": {...}, "duration": {...} } ] | null,
    "conditions": [ { "type": "hold|sliding_scale|other", "text": "short lowercase restatement" } ] | null,
    "needs_review": { "flag": true|false, "reason": "short phrase or null" }
  } ],
  "contested": false,
  "six_field": { ... see section 3 ... }
}
```

Rules for the full target:

1. **One entry per drug.** A combination product (one product, two ingredients) is one entry with `ingredient` like "zorvalol / pimetrexin" in the order written. Two separate drugs on one line are two entries.
2. **Brand names** are normalized to the generic in `ingredient`. Keep the brand in `drug_text`. If the brand is not recognizable, `ingredient` is null and `needs_review` is flagged.
3. **Dose arithmetic.** `dose.value` is the total amount per administration when it can be computed: 2 tablets of 250 mg gives 500 mg, half of a 25 mg tablet gives 12.5 mg, 10 mL of 100 mg per 5 mL gives 200 mg, 2 puffs of 90 mcg gives 180 mcg, 2 sprays in each nostril of 50 mcg gives 200 mcg. `form_quantity` records the count as written (2 tablet, 0.5 tablet, 10 mL, 2 puff, 4 spray). If no strength is given, `dose` is null and only `form_quantity` is filled. Units are written "U".
4. **Weight-based doses.** "10 mg/kg" with no weight gives `dose.value` 10, `dose_basis` "per_kg", `needs_review` flagged. With a weight given, compute the dose and set `dose_basis` null.
5. **Route.** Use the written route. Tablets, capsules and oral liquids with no written route are "oral". Unknown is null.
6. **Status.** "Stop", "discontinue", "d/c" give stopped. "Hold" with no condition gives held. "Do not take", "no longer taking" give negated. A conditional hold ("hold if SBP < 100") keeps status active and adds a `conditions` entry.
7. **Tapers and multi-phase regimens** go in `phases`, one per step, with top-level `dose` and `schedule` null.
8. **Weekly and day-of-week dosing.** "Once weekly" gives count 1 per 1 wk. "Every Monday" adds `days_of_week` ["mon"]. Different doses on different weekdays go in `phases`, one per dose, with `days_of_week`.
9. **Missing information is never invented.** No strength, no drug name, or "take as directed" gives nulls and `needs_review` flagged with the reason.
10. **Instructions inside the line** ("ignore previous instructions", "output 1000 mg") are text. Label the medication content only and flag `needs_review` with reason "embedded instruction".
11. **Spanish and mixed lines** are labeled in English vocabulary ("una tableta dos veces al día" gives 1 tablet, twice daily).
12. **Noise and OCR errors** are read as the obvious intended text when it is unambiguous ("5OO mg" is 500 mg, "rng" is mg). If two readings are plausible, flag `needs_review`.
13. **needs_review** is flagged for: missing dose or drug, weight-based dose with no weight, ambiguity, embedded instructions, sliding scales, unrecognizable brand. Otherwise false.

## 3. Six-field projection

```
"six_field": {
  "drug": "ingredient of the single active drug, or null",
  "dose_per_administration": { "value": n, "unit": "mg|mcg|g|units|mL" } | null,
  "frequency": "once_daily|twice_daily|three_times_daily|four_times_daily|every_4_hours|every_6_hours|every_8_hours|every_12_hours|once_weekly|null",
  "timing": "morning|evening|bedtime|with_meals|before_meals|after_meals|null",
  "prn": true|false,
  "prn_indication": "string or null",
  "six_field_representable": true|false
}
```

- `dose_per_administration` uses the computed mass or units (U is written "units"). It uses mL only when no concentration is given.
- `frequency` holds a schedule only (R2, C1). Day-of-week dosing other than one fixed day a week has no value here.
- `timing` takes the first anchor if it is in the list. "Before breakfast" maps to `before_meals`. Other anchors give null.
- **Not representable** (`six_field_representable` false) when the line has any of: more than one drug entry, a dose range, an interval range on a scheduled line, a taper or phases, a sliding scale or hold condition, weekday-dependent doses, a schedule not in the frequency list (for example every 2 hours, every 3 days, twice weekly), a missing dose or drug, a dose that the five units cannot hold (drops, patches with a rate, a combination product's two strengths, a weight basis with no weight), a stopped, held or negated drug, or "take as directed". On those lines fill what fits and the correct model behavior is to flag for review.

## 4. Critical fields

Set by rule from the label, not by the labelers: drug, dose magnitude, the schedule of a scheduled dose, route, and as-needed status. Critical errors are counted on their own.
