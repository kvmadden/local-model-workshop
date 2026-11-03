# Decisions that need the pharmacist

These are clinical or policy calls. The code and documents do not make them. Nothing listed here was changed without Kevin's review.

## 1. The rule for "at bedtime as needed"

- **The two rules.** The split-format gold labels "Melatonin 3 mg ... at bedtime as needed for sleep" (s25, and template lines h02 and h08) as frequency `once_daily`, timing bedtime, as needed. The extraction audit protocol in this repository says "Bedtime does not imply a daily schedule". Its challenge item c03 ("Doxepin 6 mg at bedtime as needed for insomnia") has no schedule.
- **The pick depends on which rule is used:**
  - With `once_daily`, gemma4:31b and qwen3.8:27b get every field right, and qwen wins on disk size.
  - With no schedule, only gpt-oss:20b does ([DEVELOPMENT-RESULTS.md](DEVELOPMENT-RESULTS.md)).
- **Decision needed.** Pick one rule for the fresh set and write down the reason. One option: no schedule, as-needed, and a maximum of once daily. That needs the schedule and the maximum to be separate fields, which the fresh protocol proposes.

## 2. What `frequency` means

In the split format, `frequency` is a schedule on scheduled lines ("three times daily") and a maximum rate on as-needed lines ("every 6 hours as needed"). "tid prn itching" is labeled as a standing three-times-daily schedule plus as-needed, though it is usually read as "up to three times a day if needed".

**Decision needed.** Should the fresh set separate the schedule from the as-needed maximum, as FHIR Dosage does (`timing.repeat` against `asNeeded` plus `maxDosePerPeriod`)?

## 3. Draft labels in the public label audit

The 30 public excerpts in `eval/extraction-audit/public.json` carry AI-drafted labels. A review of the text flagged the items below. They are proposals only. The file is hash-locked evidence and was not edited.

| Excerpt | Current draft label | What the text says | Proposed |
|---|---|---|---|
| p01 | dose "12.5 mg", "50 mg" | "12.5 mg per day to 50 mg per day" | Keep "per day", as p07 keeps "/day" |
| p03 | dose "000 mg" | "2,000 mg of metformin" | "2,000 mg", and add "1,000 mg" |
| p05 | dose "0.7 mg" | "0.7 mg per kg once daily" | "0.7 mg per kg" |
| p05 | as needed "as needed" | "increased ... once daily as needed to control blood pressure" | Titration, not as-needed use. Remove |
| p06 | as needed "if needed" | "Repeated 14-Day Courses (if needed)" | Course repetition. Remove |
| p07 | as needed "as needed" | "Dose can be titrated up as needed" | Titration. Remove |
| p10 | as needed "If needed" | "If needed, the same dose can be administered 6 to 8 hours later" | Decide: a conditional repeat dose or as-needed use |
| p11 | no schedule | "50 mg to 100 mg q.i.d." and "25 mg t.i.d. or q.i.d." | Add "q.i.d." and "t.i.d." |
| p14 | no as-needed label, no repeat | "at the first sign of an acute anginal attack", "every 5 minutes" | Add as-needed use and the repeat interval |
| p16 | dose "5 mg", "60 mg" | "5 mg to 60 mg of prednisone per day" | Keep the range and "per day" |
| p17 | schedule "daily" | "Obtain daily INR determinations" | Lab monitoring, not a medication schedule. Remove |
| p18 | dose "20 mg", "10 mg" | "20 mg/m 2 orally once weekly", "10 mg/m 2 ... twice weekly" | Keep "/m2". Add "once weekly", "twice weekly", "two to four times per week" |
| p19 | dose "30 ml" | "creatinine clearance below 30 mL/min" | A renal threshold, not a dose. Remove |
| p20 | dose "5 ml", "600 mg", "42.9 mg" | "600 mg/42.9 mg per 5 mL" | A concentration, not a dose. Add timing "at the start of a meal" |
| p21 | no olanzapine | olanzapine is named four times | Add the drug. Note that "5 mg" and "2.5 mg" are olanzapine doses |
| p25 | no "before bedtime" | "once daily before bedtime" | Add the timing |
| p28 | schedule "daily" | "Recommended total daily dose" | A dose total, not a schedule. Remove |
| p29 | dose "50 mg", schedule "daily" | "cisplatin ... 50 mg/m 2", "total daily dose of 8 mg" | Remove both |
| p30 | no "morning" | "twice daily (morning and bedtime)" | Add the timing |

A corrected file would be a new evidence version, with v1 and v2 kept. A second reviewer should label at least the final split independently.

## 4. Fresh test set

- The thresholds in [FRESH-TEST-PROTOCOL.md](FRESH-TEST-PROTOCOL.md): at most a 2% upper bound on the critical-error rate, then p95 at or under 10 s on a quiet machine.
- Whether a hosted model may run on the synthetic set as a reference. It sends text off the machine and costs money, so it needs explicit approval.
- Adjudicating label disagreements between the two labelers, blind to model outputs.

## 5. The case page

Whether the public case page should name any pick before the fresh set is run. The evidence supports "no model is chosen yet".
