# Archived: schema v1 runs (2026-10-30)

These two runs used the first version of the sig extraction schema. They are kept for the record and are not the current results. The current schema, labels and runs are in `eval/sig-extraction/` and `eval/results/`.

## Why the schema changed

A domain review of the schema and gold labels (Kevin Madden, PharmD) found that the single `frequency` field conflated three separate things: the schedule (once daily, every 6 hours), the time of day or anchor (bedtime, morning, with meals), and as-needed use. In v1, `at_bedtime` and `as_needed` were values in the same closed list as `once_daily`. That meant:

- "as needed", "once a day" and "once a day as needed" could not all be told apart. A line with a schedule and "as needed" was labeled by its schedule alone, so the PRN part was never scored.
- A bedtime dose was scored as `at_bedtime`, a different answer from `once_daily`, even though it is a once-daily schedule with a time-of-day anchor.
- Morning, evening and meal anchors were dropped entirely.

Schema v2 scores `drug`, `dose_per_administration`, `frequency`, `timing`, `prn` and `prn_indication` as separate fields and reports each one plus all-fields-correct. The review also confirmed two v1 labels that carry over unchanged: fluticasone "2 sprays in each nostril" of 50 mcg/spray is 200 mcg per administration, and "every evening" is a once-daily schedule (v2 adds `timing: evening`).

The 100% scores below were measured against the v1 labels. They do not carry over to v2, because v2 scores fields that v1 did not ask for.

## Label changes, v1 to v2

Drug names and doses did not change in value. They were renamed (`medication` to `drug`, `dose_value` and `dose_unit` to `dose_per_administration.value` and `.unit`). Every line also gained `timing`, `prn` and `prn_indication`.

| Line | v1 frequency | v2 frequency | v2 timing | v2 prn | v2 prn_indication |
|---|---|---|---|---|---|
| s01 lisinopril once daily | once_daily | once_daily | null | false | null |
| s02 atorvastatin QHS | at_bedtime | **once_daily** | **bedtime** | false | null |
| s03 metformin twice daily with meals | twice_daily | twice_daily | **with_meals** | false | null |
| s04 amoxicillin every 8 hours | every_8_hours | every_8_hours | null | false | null |
| s05 levothyroxine qAM, empty stomach | once_daily | once_daily | **morning** | false | null |
| s06 albuterol every 4 hours as needed for wheezing | every_4_hours | every_4_hours | null | **true** | **wheezing** |
| s07 ibuprofen q6h prn pain | every_6_hours | every_6_hours | null | **true** | **pain** |
| s08 nitroglycerin as needed for chest pain | as_needed | **null** | null | **true** | **chest pain** |
| s09 gabapentin three times daily | three_times_daily | three_times_daily | null | false | null |
| s10 prednisone once daily x 5 days | once_daily | once_daily | null | false | null |
| s11 insulin glargine at bedtime | at_bedtime | **once_daily** | **bedtime** | false | null |
| s12 methotrexate once weekly on Mondays | once_weekly | once_weekly | null | false | null |
| s13 cephalexin QID | four_times_daily | four_times_daily | null | false | null |
| s14 sertraline once daily | once_daily | once_daily | null | false | null |
| s15 ondansetron every 8 hours as needed for nausea | every_8_hours | every_8_hours | null | **true** | **nausea** |
| s16 hydrochlorothiazide qd | once_daily | once_daily | null | false | null |
| s17 metoprolol every 12 hours | every_12_hours | every_12_hours | null | false | null |
| s18 cetirizine once daily | once_daily | once_daily | null | false | null |
| s19 acetaminophen q4h PRN fever | every_4_hours | every_4_hours | null | **true** | **fever** |
| s20 omeprazole BID before meals | twice_daily | twice_daily | **before_meals** | false | null |
| s21 fluticasone once daily | once_daily | once_daily | null | false | null |
| s22 furosemide twice a day | twice_daily | twice_daily | null | false | null |
| s23 warfarin every evening | once_daily | once_daily | **evening** | false | null |
| s24 hydroxyzine tid prn itching | three_times_daily | three_times_daily | null | **true** | **itching** |
| s25 melatonin at bedtime as needed for sleep | at_bedtime | **once_daily** | **bedtime** | **true** | **sleep** |

Bold marks a value that carries information v1 did not score.

## What is in this folder

- `gold.jsonl`, `schema.json`, `prompt.txt`: the v1 inputs these runs used.
- `2026-10-30-run1/`, `2026-10-30-run2/`: raw outputs and summaries, unchanged. Each raw line includes the v1 per-case score.

Run 1 overlapped with test and build runs on the same machine. Run 2 ran with the 1-minute load average between about 74 and 154 on 10 cores.
