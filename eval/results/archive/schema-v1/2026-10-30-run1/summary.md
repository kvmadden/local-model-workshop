Run 2026-10-30 on Apple M1 Max, 64 GB, Ollama 0.40.6. n=25, temperature 0.

| Model | Settings | All fields | Medication | Dose | Frequency | Valid JSON | p50 latency | p95 latency |
|---|---|---|---|---|---|---|---|---|
| mock (echo) | echo, no model | 0/25 (0%) | 0/25 (0%) | 0/25 (0%) | 0/25 (0%) | 0/25 (0%) | n/a | n/a |
| gpt-oss:20b | 20.9B, MXFP4, think="low" | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | 4.96 s | 19.43 s |
| gemma4:31b | 31.7B, nvfp4, think=false | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | 4.87 s | 7.88 s |
| qwen3.8:27b | 27.8B, nvfp4, think=false | 23/25 (92%) | 25/25 (100%) | 25/25 (100%) | 23/25 (92%) | 25/25 (100%) | 4.19 s | 5.64 s |
