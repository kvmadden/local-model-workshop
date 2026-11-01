# Before and after on both sets

| Set | Model | v1 before | v2 after |
|---|---|---|---|
| Original 25, two runs | gpt-oss:20b | 25/25, 25/25 | 24/25, 24/25 |
| Frozen holdout 12, one run | gpt-oss:20b | 12/12 | 10/12 |
| Original 25, two runs | gemma4:31b | 25/25, 25/25 | 25/25, 25/25 |
| Frozen holdout 12, one run | gemma4:31b | 12/12 | 12/12 |
| Original 25, two runs | qwen3.8:27b | 23/25, 24/25 | 25/25, 25/25 |
| Frozen holdout 12, one run | qwen3.8:27b | 9/12 | 12/12 |

## Heldout timing

One pass per schema on a shared Mac. Load differs by model and revision. These are not controlled speed comparisons.

| Model | v1 p50 / p95 | v2 p50 / p95 | v1 load start / end | v2 load start / end |
|---|---|---|---|---|
| gpt-oss:20b | 3.33 s / 4.32 s | 6.58 s / 7.66 s | 201.4 / 241.3 | 221.1 / 224.8 |
| gemma4:31b | 4.93 s / 5.68 s | 7.13 s / 8.48 s | 258.9 / 292.8 | 241.7 / 182.1 |
| qwen3.8:27b | 3.92 s / 10.33 s | 4.56 s / 12.51 s | 311.1 / 257.4 | 172 / 165.8 |

v1 scores drug, dose and frequency. v2 also scores timing, PRN and PRN reason. Holdout before and after are fresh runs of the unchanged archived and current prompts. No tuning was performed.

See [protocol and limits](EVALUATION.md) and [every miss](MISSES.md).
