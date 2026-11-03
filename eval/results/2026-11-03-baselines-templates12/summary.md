# templates12: development data: six templates taken from the 25 development lines, each filled in twice

Format: split (v2: drug, dose, frequency, timing, prn, prn_indication). Scorer: sig-v3 (src/eval/sigScoreV3.ts). 12 lines. Started 2026-11-03T11:58:31.543Z.
Models answer under JSON-schema constrained decoding, so a parseable reply is guaranteed by the decoder, not earned by the model.
Intervals are exact 95% binomial intervals for the all-fields count.

| Row | All fields | 95% interval | drug | dose | frequency | timing | prn | prn_indication |
|---|---|---|---|---|---|---|---|---|
| mock (echo) | 0/12 | 0.0 to 26.5% | 0/12 | 0/12 | 0/12 | 0/12 | 0/12 | 0/12 |
| baseline: rules | 12/12 | 73.5 to 100.0% | 12/12 | 12/12 | 12/12 | 12/12 | 12/12 | 12/12 |
| baseline: constant | 0/12 | 0.0 to 26.5% | 0/12 | 0/12 | 4/12 | 6/12 | 6/12 | 6/12 |
| baseline: copy | 0/12 | 0.0 to 26.5% | 0/12 | 0/12 | 2/12 | 6/12 | 6/12 | 0/12 |
