Run 2026-10-30 on Apple M1 Max, 64 GB, Ollama 0.40.6. n=25, temperature 0.

| Model | Settings | All fields | Medication | Dose | Frequency | Valid JSON | p50 latency | p95 latency | Load avg (1m) start/end |
|---|---|---|---|---|---|---|---|---|---|
| mock (echo) | echo, no model | 0/25 (0%) | 0/25 (0%) | 0/25 (0%) | 0/25 (0%) | 0/25 (0%) | n/a | n/a | 74.4 / 74.4 |
| gpt-oss:20b | 20.9B, MXFP4, think="low" | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | 5.63 s | 9.23 s | 73.6 / 153.5 |
| gemma4:31b | 31.7B, nvfp4, think=false | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | 6.22 s | 8.65 s | 147.6 / 114.5 |
| qwen3.8:27b | 27.8B, nvfp4, think=false | 24/25 (96%) | 25/25 (100%) | 25/25 (100%) | 24/25 (96%) | 25/25 (100%) | 4.18 s | 5.27 s | 106.3 / 123.6 |
