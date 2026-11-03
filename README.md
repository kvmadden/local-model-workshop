# Local model workshop

A browser workshop for chaining prompt steps against a model on your own Mac, plus a command-line eval that tests local models on synthetic medication instructions through the same engine.

[![CI](https://github.com/kvmadden/local-model-workshop/actions/workflows/ci.yml/badge.svg)](https://github.com/kvmadden/local-model-workshop/actions/workflows/ci.yml)

## The honest result

On 37 short, clean synthetic medication lines, three local models (20.9B to 31.7B parameters), run through the app's engine at temperature 0 under a JSON schema, got every field right on 24 to 25 of 25 lines and 10 to 12 of 12 lines.

- **No reading errors.** None of 372 scored answers got the drug or the dose wrong.
- **One convention behind every miss.** All 10 misses are the same thing: how the answer format encodes "as needed" next to a schedule or a bedtime anchor.
- **Rules do as well.** A short rules parser also gets every field right on 25 of 25 and 12 of 12.
- **So the sets decide nothing.** They are too regular to rank the models or to show value over rules.
- **Both sets are development data.** The 25 lines are the lines the answer format was revised on. The 12 lines are six templates taken from those 25.
- **The pick turns on one label.** Under the label rule the gold uses, the pick is qwen3.8:27b, by 1.2 GB of disk. Under the rule the repository's own audit protocol uses, it is gpt-oss:20b.
- **Speed is unmeasured.** No quiet-machine run exists, so performance against the 10-second budget is unknown.

**No model is chosen.** A fresh blind test set is specified in [docs/FRESH-TEST-PROTOCOL.md](docs/FRESH-TEST-PROTOCOL.md) and has not been written yet.

![Every field right on the two development sets, with the rules parser](docs/media/results.png)

Full tables, intervals, the per-field floor, every miss, the latency facts and the sensitivity of the pick: [docs/DEVELOPMENT-RESULTS.md](docs/DEVELOPMENT-RESULTS.md).

## The pharmacist's contribution

The first answer format put the schedule, bedtime and "as needed" into one frequency field. A line like "hydroxyzine 25 mg tid prn itching" could then be scored on its schedule or on "as needed", never both. Kevin Madden, PharmD, found that conflation and the format was split into frequency, timing, as-needed use and reason.

The model rejected under the first format then got every field right. That change is a better definition of the task, not evidence that a model improved. Because it was made after seeing these lines, those lines became development data.

The same review shows the decision that remains. The split format's `frequency` field still means two things:

- a schedule, for "three times daily"
- a maximum, for "every 6 hours as needed"

Labeling "at bedtime as needed" as `once_daily` follows the prompt, but the audit protocol in this repository says a bedtime anchor is not a schedule. That rule is now a pharmacist decision ([docs/KEVIN-REVIEW.md](docs/KEVIN-REVIEW.md)), to be settled before the fresh set is labeled.

## What the pick depends on

| Rule for "at bedtime as needed" | Latency gate | Pick |
|---|---|---|
| Once daily (current gold) | Not applied, as published | qwen3.8:27b, on 1.2 GB less disk |
| Once daily | Applied to the 25-line runs | None. Every p95 was over 10 s on a loaded machine |
| Once daily | Applied to the 12-line run | gemma4:31b. qwen's 12.5 s was its first request |
| No schedule (the audit protocol's rule) | Not applied | gpt-oss:20b |

Computed from the saved replies by `src/eval/decision.test.ts`. No model was run for this table.

## What the workshop does

- **Flow builder.** Chain prompt steps. A step's prompt can use `{{input}}` or an earlier step's output (`{{step1.output}}`). Each step runs on:
  - a built-in mock, the default, which needs nothing installed
  - a local Ollama
  - an OpenAI-compatible server on this Mac, such as LM Studio
- **Local by default, and enforced.** The adapters refuse to send prompt text to any host that is not this machine unless code explicitly sets `allowRemote` (and, for a hosted OpenAI endpoint, an API key). Running locally does not by itself make anything private or compliant. Storage, logging and network settings still need their own checks.
- **Reference tabs.** A task wizard, a model catalog, a hardware advisor and four playgrounds. Catalog speeds are bandwidth arithmetic, not measurements. Playground output is labeled demo output unless a matching local model ran.
- **Saved-run inspector.** Benchmark Studio opens an inspector for the extraction audit on public label text (below).

## The eval

`scripts/eval-sig.ts` runs each line as a one-step flow through the same FlowRunner and adapter as the app, scores every reply, and writes the raw replies and a summary into a new folder.

```bash
npm run eval -- --help                        # all options
npm run eval:baselines                        # rules, constant, copy and echo baselines, no Ollama needed
npm run eval -- --out eval/results/my-run     # baselines plus every model in eval/sig-extraction/models.json
npm run eval -- --suite templates12 --models gemma4:31b --out eval/results/my-run
npm run eval -- --suite path/to/locked-set.json --out eval/results/fresh-run
```

What the harness does on every run:

- **Never overwrites.** It refuses an existing output folder.
- **Randomizes order.** Case and model order are shuffled from a recorded seed.
- **Times honestly.** It makes two warm-up requests, reports the first timed request apart, enforces a per-request deadline, and counts failed requests at the time they took.
- **Records provenance.** Each summary records hashes of the suite, prompt, schema and every source file, plus the git commit, model digest and size, settings and load samples.
- **Reports intervals.** It prints exact 95% intervals and labels both built-in suites as development data.

Scoring uses scorer v3 (`src/eval/sigScoreV3.ts`):

- **Drug.** It needs every gold drug word, and allows an extra word only if it is a salt or form word the line itself uses. Copying the line, adding a drug, a negation or a different salt all fail.
- **Reason.** As-needed reasons must match exactly, apart from filler words.
- **Dose.** Mass units convert, so 1 g equals 1000 mg.
- **Schema problems** are reported apart from correctness.

The v2 scorer that produced the committed verdicts is kept, and a test re-derives every stored verdict from the saved replies.

## The extraction audit on public label text

A second, unfinished benchmark extracts literal mentions (drug, dose, schedule, timing, as-needed use, reason) from 30 unchanged openFDA dosage sections and 12 synthetic challenge lines, with source and CC0 rights records for each excerpt. Its state:

- **Draft labels.** The labels are AI-drafted and unreviewed. Review flagged at least 14 of the 30 public documents for likely label errors. Examples: methotrexate's weekly schedule is missing, "20 mg/m 2" is labeled "20 mg", and a creatinine clearance threshold is labeled as a dose. They are listed for review in [docs/KEVIN-REVIEW.md](docs/KEVIN-REVIEW.md). No label was changed without that review.
- **The old evaluator measured offsets, not facts.** Evaluator v2 required exact character offsets from the model. On the saved partial run, a line with all five facts right scored 0 of 5 because every offset was one character off.
- **Evaluator v3 separates the two.** It scores facts and evidence separately and accepts quoted evidence ([eval/extraction-audit/V3.md](eval/extraction-audit/V3.md)).
- **No result yet.** No complete model run exists. The one exploratory run stopped at 23 of 42 requests.

## Running and testing

Tested with Node 24.

```bash
npm ci
npm run dev                       # http://127.0.0.1:5176, starts in mock mode
npm test                          # unit tests, including evidence re-scoring
npx playwright install chromium   # once
npm run test:e2e                  # browser tests, with Ollama stubbed
npm run build                     # typecheck and production build
npm run audit:score               # reproduce the audit artifacts offline
node scripts/render-results.mjs   # redraw the results chart from the committed summaries
```

The browser app talks to `http://localhost:11434` directly. Ollama accepts requests from localhost pages by default. If you serve the app from any other origin, add only that origin to `OLLAMA_ORIGINS`. Never set it to `*`, which lets any website you visit use your local models.

CI runs the unit tests, the build, the offline audit check, a baselines run and the browser tests on every pull request.

## Limits

- **Small, synthetic and clean.** All lines are synthetic, and both sets are small and too easy. Nothing here is a real-world error rate, and nothing is validated for patient care.
- **Not small models.** The three models are 20.9B to 31.7B parameters (13.8 to 19.4 GB on disk). They were the ones already installed. The 3 to 8B models in the catalog were not run.
- **Unequal settings.** gpt-oss ran with thinking on its lowest setting. The others ran with thinking off. Quantization differs (MXFP4 and NVFP4).
- **Fields not scored.** The six fields do not score route, duration, daily maximum, day of week or administration conditions. Six of the 25 lines contain one of these.
- **Latency.** All timing came from a shared, heavily loaded Mac.
- **Same author.** The prompt, the labels and the pharmacist review are from the same author. Two labels were judgment calls. The fresh protocol uses independent writers and two labelers.

## Documents

- [docs/DEVELOPMENT-RESULTS.md](docs/DEVELOPMENT-RESULTS.md): current tables and their sources.
- [docs/FRESH-TEST-PROTOCOL.md](docs/FRESH-TEST-PROTOCOL.md): the pre-registered blind test set and decision rule.
- [docs/KEVIN-REVIEW.md](docs/KEVIN-REVIEW.md): decisions that need the pharmacist.
- [docs/CORRECTIONS.md](docs/CORRECTIONS.md): claims in the older documents that the evidence does not support, with corrections.
- [eval/sig-extraction/README.md](eval/sig-extraction/README.md) and [eval/heldout/README.md](eval/heldout/README.md): data cards.
- [docs/README.md](docs/README.md): an index of current and historical documents.

The historical documents ([docs/ORIGINAL-EVALUATION.md](docs/ORIGINAL-EVALUATION.md), [docs/EVALUATION.md](docs/EVALUATION.md), [docs/RESULTS.md](docs/RESULTS.md), [docs/MISSES.md](docs/MISSES.md), [docs/VERIFICATION.md](docs/VERIFICATION.md)) are kept byte for byte, because a test checks them against a hash manifest. Read them with [docs/CORRECTIONS.md](docs/CORRECTIONS.md).

## How it was built

Kevin Madden, PharmD, designed the workshop, the task and the schema review. AI coding tools wrote much of the code, tests and documentation, and this revision followed a review by four model families ([docs/HOW-BUILT.md](docs/HOW-BUILT.md)).

MIT, Copyright (c) 2026 Kevin Madden. The eval lines are synthetic. The audit excerpts are public openFDA label text with no patient data.
