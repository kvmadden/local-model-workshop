# Fixed public extraction audit

Draft, pending pharmacist review. These are offline controls, not model quality measurements. No second independent review has occurred.

| Control | Set | Exact/docs | TP/predicted | TP/gold | Unsupported | Missing |
| --- | --- | --- | --- | --- | --- | --- |
| empty | dev | 0/10 | 0/0 | 0/70 | 0/N/A | 70/70 |
| empty | final | 0/20 | 0/0 | 0/104 | 0/N/A | 104/104 |
| empty | challenge | 2/12 | 0/0 | 0/35 | 0/N/A | 35/35 |
| everything | dev | 0/10 | 1/5852 | 1/70 | 5851/5852 | 69/70 |
| everything | final | 0/20 | 10/10710 | 10/104 | 10700/10710 | 94/104 |
| everything | challenge | 0/12 | 14/644 | 14/35 | 630/644 | 21/35 |
| rules | dev | 0/10 | 14/45 | 14/70 | 31/45 | 56/70 |
| rules | final | 0/20 | 30/71 | 30/104 | 41/71 | 74/104 |
| rules | challenge | 2/12 | 12/13 | 12/35 | 1/13 | 23/35 |

Each JSON report contains all errors, per-task denominators, source-family bootstrap intervals and the first eight failures under the published fixed ordering. Zero-denominator ratios are null (N/A).

Local model results and the 10 second p95 budget remain unmeasured for this corpus. Historical timing remains inconclusive. See AUDIT.md for acquisition and review limits.
