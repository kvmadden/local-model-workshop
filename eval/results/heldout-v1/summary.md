Run 2026-11-01 on Apple M1 Max, 64 GB, Ollama 0.40.6. n=12, temperature 0.

| Model | Settings | All fields | Drug | Dose | Frequency | Valid JSON | p50 latency | p95 latency | Load avg (1m) start/end |
|---|---|---|---|---|---|---|---|---|---|
| mock (echo) | echo, no model | 0/12 (0%) | 0/12 (0%) | 0/12 (0%) | 0/12 (0%) | 0/12 (0%) | n/a | n/a | 200.3 / 200.3 |
| gpt-oss:20b | 20.9B, MXFP4, think="low" | 12/12 (100%) | 12/12 (100%) | 12/12 (100%) | 12/12 (100%) | 12/12 (100%) | 3.33 s | 4.32 s | 201.4 / 241.3 |
| gemma4:31b | 31.7B, nvfp4, think=false | 12/12 (100%) | 12/12 (100%) | 12/12 (100%) | 12/12 (100%) | 12/12 (100%) | 4.93 s | 5.68 s | 258.9 / 292.8 |
| qwen3.8:27b | 27.8B, nvfp4, think=false | 9/12 (75%) | 12/12 (100%) | 12/12 (100%) | 9/12 (75%) | 12/12 (100%) | 3.92 s | 10.33 s | 311.1 / 257.4 |
