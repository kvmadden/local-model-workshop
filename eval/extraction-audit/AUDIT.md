# Extraction audit protocol

Can a local model preserve dose, schedule and as-needed meaning, cite the exact evidence and meet a 10 second p95 latency budget?

Answer: the new benchmark and offline controls are reproducible, but the new gold is draft and a quiet-machine latency budget has not been validated. Historical runs remain separate and unchanged.

## Corpus and rights

`public.json` contains 10 development and 20 final excerpts. Each is a contiguous unchanged prefix of an openFDA dosage-and-administration section, capped at 900 characters at a word boundary. Section snapshots, source IDs, source-family keys, excerpt offsets, retrieval URLs, timestamps and SHA-256 values are committed. Sources were selected by a fixed list of 30 generic-name searches, not by model performance. Combination-product matches are retained as retrieved, not relabeled as single-drug prescriptions.

The source manifest is the `source` object on each case. The drug label text is used under the [openFDA default CC0 policy](https://open.fda.gov/license/). No GMDN device fields are included. Each record links to the original DailyMed label and the exact openFDA acquisition query. No CAPTCHA, login or paid API was used. This is not an endorsement by FDA or NLM.

Splits are assigned by source family before inference. A source family includes any derivative or corruption of the same source. There are no planted public edits. The separate 12-case challenge is original synthetic text under CC0 and explicitly identified as such. It exercises abbreviations, PRN alone, bedtime plus PRN, half tablets, units, missing dose, negation, stopped medication and multiple drugs. Its nonstandard values are testing text, not clinical dose recommendations.

## Target and evidence

The public task extracts literal mentions from label prose. It does not resolve a label into a patient prescription. Dose ranges, daily quantities and weight-based doses retain their literal units. The challenge task extracts active medication instructions, with negated and stopped instructions excluded. Bedtime does not imply a daily schedule. Missing fields are absent entities, not invented facts. Every draft contains an explicit ambiguity note.

The target is a set of normalized `(task, value)` pairs. Normalization lowercases, trims and collapses whitespace only. It does not use expected-token inclusion, substring drug matching or convert units silently. The canonical evidence is the first occurrence of a repeated pair. Offsets are zero-based JavaScript string offsets with exclusive ends. Predictions need the same exact source spans and derivation as gold to count as supported. A semantically plausible alternate span is counted wrong under this deliberately strict rubric and can be reviewed in the error list.

A calculated dose cites strength and count separately and includes multiplication operands and the unit. The half-tablet example cites `12.5 mg` and `half`, deriving `6.25 mg`. There is no invented contiguous calculated-value span. All new labels are AI-proposed drafts, pending Kevin's pharmacist review. No reviewed quality metric is emitted for them. Reviewer and correction fields are item-level and currently empty. No second independent review has occurred.

Original v1 and v2 schemas remain unchanged. Their historical shared-field scores are retained under their original target. The new literal-mention target is not numerically compared with the old single-instruction target. Timing and PRN remain separate tasks rather than being imputed into v1.

## Controls and isolation

Empty, extract-everything and narrow rules controls run on exactly the same text. The empty control exposes false negatives. The verbose control assigns every word to every task and exposes false positives, including invented drugs and schedules. The narrow rules baseline has dose, schedule and PRN patterns only, with no drug dictionary or benchmark answer key. These controls are diagnostics, not model-quality results.

Runtime accepts only input text, declared prompt, schema and model configuration. Tests mutate IDs, tags and gold and compare actual FlowRunner adapter calls and outputs. Isolation tests scan the inference dependency path and prompt for corpus filenames and challenge pools. Gold and source metadata stay in the evaluation and UI layers. The public key makes this a fixed public benchmark, not a blind test.

No corruption generator or generated edit is used. A common serialization, fresh-value swaps, masked-window classifier and Kevin's blind 20-window check are prerequisites if a future change adds planted edits. They have not been performed and this package makes no indistinguishability claim.

## Offline reproduction

```sh
npm ci
npm run audit:score
npx vitest run src/eval/extractionAudit.test.ts
```

Scoring has no network calls. Tests replace fetch with a throwing function and reproduce every committed control report, complete error list and gallery. Source snapshots verify excerpt provenance offline. Original file hashes are checked separately. No model installation is required for these commands.

Reports give true positives / predicted facts, true positives / gold facts, unsupported / predicted facts, missing / gold facts, exact documents, abstentions and per-task denominators, separately for development, final and challenge. Zero-denominator precision or recall is N/A, represented as null. The bootstrap samples source document families with replacement 1,000 times using a fixed seed and publishes the 2.5th and 97.5th percentile ratios. This describes a small fixed corpus, not clinical generalization.

Errors sort by wrong dose, invented medication, lost PRN or schedule, unsupported extra, timeout, then case ID. The gallery is always the first eight entries. The full errors and documents are retained in each report, with supported, unsupported and missing facts.

## Local acquisition and timing

```sh
npm run audit:infer -- --out eval/extraction-audit/local-NEW-ID
```

The output directory must be new. The runner freezes corpus, prompt, schema, rubric, adapter, FlowRunner, model configuration and runner hashes, installed model digests and hardware before its first request. It runs the three existing named models only. There is no download, paid API or hosted comparison. The script preserves acquisition failures and partial outputs. It must be rerun into a new directory after a code change.

Two deterministic randomized passes reverse model order between passes and independently shuffle case order. A separate warm-up is preserved as the first-request observation, followed by warm request timings. The first-request observation is not asserted to be a true cold load. Run metadata records machine load and successful timing denominators. Timed failures do not disappear from the request count. A shared-machine pass cannot validate the requested quiet-machine budget. Repeat agreement is not a quality score. No prompt or scorer changes are made in response to final results.

The initial acquisition attempt in `local-20261101` failed at the endpoint with HTTP 405 because the new runner initially supplied the server root instead of the adapter's generate route. It is preserved as acquisition failure evidence, not a model-quality result. The corrected runner and a fresh freeze use `/api/generate` in a separate run.

## Inspector

Open Benchmark Studio. The saved-run inspector shows the deterministic rules control, source and CC0 license, untouched text, supported and missing facts, exact spans, derivations and draft review state. Model digest is N/A for this control. It links to the complete machine-readable errors and interval report. It does not present controls as model outputs or draft labels as reviewed facts.

The corrected exploratory acquisition was stopped after 23 of 42 requests for Qwen in pass one. The shared host had a load average around 50, so it could not supply the quiet-machine environment required by this protocol. The completed outputs and the interruption record are preserved in `local-20261101-corrected`. Two complete corrected timing passes are still pending. There is no full-corpus model score, model ranking or p95 claim from this partial run. The inspector can show its original replies, draft-supported facts and errors while its aggregate scores remain unmeasured.

`npm run audit:inspect` rebuilds the inspector and partial inspection artifact from saved files. `npm run audit:rescore -- --run eval/extraction-audit/local-20261101` reproduces the initial failed acquisition reports offline. For a completed corrected run, pass that new directory to the same command. The partial reply inspector is reproducible with `npx vite-node scripts/audit-partial.ts --file eval/extraction-audit/local-20261101-corrected/pass1-qwen3_8_27b.json`. None of these scoring commands makes a network request.

Entity sets do not establish that a model associates every dose with the correct drug in multi-drug text, resolves all label alternatives or makes a clinically appropriate prescribing decision. Alternate valid evidence spans can lose credit under the first-occurrence rule. The synthetic values and the public literal-mention task limit generalization. These are extraction diagnostics, not clinical certification.
