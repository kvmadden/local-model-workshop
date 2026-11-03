# dev25: development data: the 25 lines the split format, prompt and labels were revised on

Format: split (v2: drug, dose, frequency, timing, prn, prn_indication). Scorer: sig-v3 (src/eval/sigScoreV3.ts). 25 lines. Started 2026-11-03T11:58:30.974Z.
Models answer under JSON-schema constrained decoding, so a parseable reply is guaranteed by the decoder, not earned by the model.
Intervals are exact 95% binomial intervals for the all-fields count.

| Row | All fields | 95% interval | drug | dose | frequency | timing | prn | prn_indication |
|---|---|---|---|---|---|---|---|---|
| mock (echo) | 0/25 | 0.0 to 13.7% | 0/25 | 0/25 | 0/25 | 0/25 | 0/25 | 0/25 |
| baseline: rules | 25/25 | 86.3 to 100.0% | 25/25 | 25/25 | 25/25 | 25/25 | 25/25 | 25/25 |
| baseline: constant | 0/25 | 0.0 to 13.7% | 0/25 | 0/25 | 11/25 | 18/25 | 18/25 | 18/25 |
| baseline: copy | 0/25 | 0.0 to 13.7% | 0/25 | 0/25 | 1/25 | 18/25 | 18/25 | 0/25 |

The rules parser could not read part of 6 of 25 lines. Those parts are instructions the six fields cannot hold, so an all-fields match on those lines does not mean the whole instruction was kept:

- s04: 10 days
- s05: empty stomach
- s10: x 5 days
- s12: mondays
- s13: x 7d
- s19: max 10 day
