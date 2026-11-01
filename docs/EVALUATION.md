# Reading the model decision

The task comes first: extract dose, schedule and as-needed information from a synthetic medication instruction. A general leaderboard cannot decide whether a model preserves those distinctions on this machine.

The harness sends each instruction through the same flow runner and adapter as the editor. It saves the input, gold, raw output, score and wall-clock latency. The default echo mock earns zero and proves the plumbing runs without a model.

## What the pharmacist review changed

The original schema forced schedule, bedtime and as-needed use into one frequency field. Kevin Madden, PharmD, found that this could hide information. The revised schema separates frequency, timing, PRN and PRN reason.

For example, `hydroxyzine tid prn itching` has both a three-times-daily schedule and as-needed use. Qwen chose `as_needed` under v1 and lost credit against the schedule label. Under v2 it represented both. This is a better task definition, not proof that a model became more clinically capable.

The original 25 inputs, both sets of labels, both prompts and all four historical run directories remain unchanged. Qwen scored 23/25 and 24/25 before the split and 25/25 in both runs after it. Because v2 asks for more fields, the two percentages are not interchangeable measures of the same target.

## Frozen holdout protocol

`eval/heldout/frozen.json` was committed before new inference, with seed 20261031 and generator `scripts/generate-holdout.mjs`. It contains 12 synthetic instructions using fictional drug names and six template families, each represented twice with seeded strengths. No real patient or employer data is used.

The test checks exact reproduction, disjoint inputs and internally consistent labels. These are new instructions, but the task patterns resemble the development set. This is a narrow holdout, not evidence of broad generalization. Template-generated gold has not had independent pharmacist review.

Run unchanged archived v1 and unchanged v2 prompts once per model at temperature zero. Do not revise prompts, labels, scorer rules or model settings after reading these outputs. Publish every miss. The before and after on this new set are fresh runs of the old and new schema, not measurements collected before the October 30 schema review.

```bash
node scripts/generate-holdout.mjs   # stdout, does not overwrite the freeze
npm run eval -- --heldout --schema-v1 --out eval/results/heldout-v1
npm run eval -- --heldout --out eval/results/heldout-v2
```

The v1 scorer reuses existing name, dose and frequency rules. Its test reproduces every archived case verdict. Timing and PRN counts in v1 summary JSON are placeholders from the shared scorer and must not be interpreted. The Markdown report intentionally shows only v1's three scored fields.

## Limits that affect the decision

The original decision required 25/25 correctness, repeat stability and p95 at or below 10 seconds, then preferred smaller size and lower median latency. No model passed every gate. The Mac had heavy and uneven load, so the timing comparison cannot establish a reliable winner. Disk size is not measured peak memory.

A local model avoids a hosted inference fee, but still consumes hardware, electricity, operator time and memory. This experiment did not measure those costs, token counts or a hosted baseline. It cannot support a dollar savings claim.

For sensitive text, choose a local endpoint when the workflow requires keeping inference on a controlled machine and that machine can meet the task's quality and latency budget. Confirm endpoint location and the surrounding storage and access controls. For hosted inference, use only text approved for that service under the organization's data and retention rules. Hosting may reduce hardware operations and expand model choice, but adds network dependency and usage charges. Neither deployment choice establishes clinical safety or compliance. This workshop uses synthetic text only.
