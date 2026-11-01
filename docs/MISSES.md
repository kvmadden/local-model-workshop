# Published misses

Generated from committed raw output. Historical v1 and v2 score different fields. Mock misses are all echo output and are omitted here. Every non-mock miss is listed below.

## 2026-10-30-run1 | qwen3.8:27b | s24

Input: Hydroxyzine HCl 25 mg tab 1 po tid prn itching

Expected:
```json
{
  "id": "s24",
  "medication": "hydroxyzine",
  "medication_match": "hydroxyzine",
  "dose_value": 25,
  "dose_unit": "mg",
  "frequency": "three_times_daily"
}
```

Model output:
```text
{
  "medication": "Hydroxyzine HCl",
  "dose_value": 25,
  "dose_unit": "mg",
  "frequency": "as_needed"
}
```

Failed fields: frequency

## 2026-10-30-run1 | qwen3.8:27b | s25

Input: Melatonin 3 mg tab - take 1 tablet by mouth at bedtime as needed for sleep

Expected:
```json
{
  "id": "s25",
  "medication": "melatonin",
  "medication_match": "melatonin",
  "dose_value": 3,
  "dose_unit": "mg",
  "frequency": "at_bedtime"
}
```

Model output:
```text
{
  "medication": "Melatonin",
  "dose_value": 3,
  "dose_unit": "mg",
  "frequency": "as_needed"
}
```

Failed fields: frequency

## 2026-10-30-run2 | qwen3.8:27b | s24

Input: Hydroxyzine HCl 25 mg tab 1 po tid prn itching

Expected:
```json
{
  "id": "s24",
  "medication": "hydroxyzine",
  "medication_match": "hydroxyzine",
  "dose_value": 25,
  "dose_unit": "mg",
  "frequency": "three_times_daily"
}
```

Model output:
```text
{
  "medication": "Hydroxyzine HCl",
  "dose_value": 25,
  "dose_unit": "mg",
  "frequency": "as_needed"
}
```

Failed fields: frequency

## 2026-10-30-v2-run1 | gpt-oss:20b | s25

Input: Melatonin 3 mg tab - take 1 tablet by mouth at bedtime as needed for sleep

Expected:
```json
{
  "id": "s25",
  "drug": "melatonin",
  "drug_match": "melatonin",
  "dose_per_administration": {
    "value": 3,
    "unit": "mg"
  },
  "frequency": "once_daily",
  "timing": "bedtime",
  "prn": true,
  "prn_indication": "sleep"
}
```

Model output:
```text
{"drug":"Melatonin","dose_per_administration":{"value":3,"unit":"mg"},"frequency":null,"timing":"bedtime","prn":true,"prn_indication":"sleep"}
```

Failed fields: frequency

## 2026-10-30-v2-run2 | gpt-oss:20b | s25

Input: Melatonin 3 mg tab - take 1 tablet by mouth at bedtime as needed for sleep

Expected:
```json
{
  "id": "s25",
  "drug": "melatonin",
  "drug_match": "melatonin",
  "dose_per_administration": {
    "value": 3,
    "unit": "mg"
  },
  "frequency": "once_daily",
  "timing": "bedtime",
  "prn": true,
  "prn_indication": "sleep"
}
```

Model output:
```text
{"drug":"Melatonin","dose_per_administration":{"value":3,"unit":"mg"},"frequency":null,"timing":"bedtime","prn":true,"prn_indication":"sleep"}
```

Failed fields: frequency

## heldout-v1 | qwen3.8:27b | h01

Input: fictalfa 8 mg tablets, take 2 tablets by mouth tid prn itching

Expected:
```json
{
  "id": "h01",
  "medication": "fictalfa",
  "medication_match": "fictalfa",
  "dose_value": 16,
  "dose_unit": "mg",
  "frequency": "three_times_daily"
}
```

Model output:
```text
{
  "medication": "fictalfa",
  "dose_value": 16,
  "dose_unit": "mg",
  "frequency": "as_needed"
}
```

Failed fields: frequency

## heldout-v1 | qwen3.8:27b | h07

Input: fictgolf 4 mg tablets, take 2 tablets by mouth tid prn itching

Expected:
```json
{
  "id": "h07",
  "medication": "fictgolf",
  "medication_match": "fictgolf",
  "dose_value": 8,
  "dose_unit": "mg",
  "frequency": "three_times_daily"
}
```

Model output:
```text
{
  "medication": "fictgolf",
  "dose_value": 8,
  "dose_unit": "mg",
  "frequency": "as_needed"
}
```

Failed fields: frequency

## heldout-v1 | qwen3.8:27b | h08

Input: ficthotel 4 mg tablets, take half a tablet at bedtime as needed for sleep

Expected:
```json
{
  "id": "h08",
  "medication": "ficthotel",
  "medication_match": "ficthotel",
  "dose_value": 2,
  "dose_unit": "mg",
  "frequency": "at_bedtime"
}
```

Model output:
```text
{
  "medication": "ficthotel",
  "dose_value": 2,
  "dose_unit": "mg",
  "frequency": "as_needed"
}
```

Failed fields: frequency

## heldout-v2 | gpt-oss:20b | h02

Input: fictbravo 4 mg tablets, take half a tablet at bedtime as needed for sleep

Expected:
```json
{
  "id": "h02",
  "drug": "fictbravo",
  "drug_match": "fictbravo",
  "dose_per_administration": {
    "value": 2,
    "unit": "mg"
  },
  "frequency": "once_daily",
  "timing": "bedtime",
  "prn": true,
  "prn_indication": "sleep"
}
```

Model output:
```text
{"drug":"fictbravo","dose_per_administration":{"value":2,"unit":"mg"},"frequency":null,"timing":"bedtime","prn":true,"prn_indication":"sleep"}
```

Failed fields: frequency

## heldout-v2 | gpt-oss:20b | h08

Input: ficthotel 4 mg tablets, take half a tablet at bedtime as needed for sleep

Expected:
```json
{
  "id": "h08",
  "drug": "ficthotel",
  "drug_match": "ficthotel",
  "dose_per_administration": {
    "value": 2,
    "unit": "mg"
  },
  "frequency": "once_daily",
  "timing": "bedtime",
  "prn": true,
  "prn_indication": "sleep"
}
```

Model output:
```text
{"drug":"ficthotel","dose_per_administration":{"value":2,"unit":"mg"},"frequency":null,"timing":"bedtime","prn":true,"prn_indication":"sleep"}
```

Failed fields: frequency
