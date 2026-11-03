# How this was built

Kevin Madden, PharmD, designed this workshop and its model-selection question. His review of the original medication schema identified that schedule and as-needed use needed separate fields. He reviewed the original synthetic labels and evaluates the clinical meaning of the results.

AI coding tools assisted with application code, tests, evaluation tooling and documentation. The extraction audit adds AI-proposed draft annotations to unchanged openFDA excerpts and a separate original synthetic challenge. Kevin has not yet reviewed these new annotations or any blind edits. There is no second independent reviewer recorded. The new draft work must not be attributed to him as completed labeling.

The audit uses the existing FlowRunner and Ollama adapter. Offline rescoring reads committed source snapshots, predictions and gold without accessing a model or network. It preserves the original schemas, prompts, labels, replies and published results.

The public excerpts are source-family split before inference. Their rights records link to openFDA's CC0 policy and the original label. The challenge is explicitly synthetic and dedicates its original text under CC0. No public text was planted or edited to insert answer values. There is no claim that synthetic items are indistinguishable from real labels.

The inspector reuses the app's Slate and Indigo tokens, theme controls and responsive layout. Its saved example is the narrow rules control, with the control identity and draft status visible. Model timing and quality claims require their own saved acquisition evidence.

## The November 2026 review

Four model families (GPT, Grok, Gemini and Claude) reviewed the repository and the case study independently, then their findings were merged into one register. Claude made the changes in this revision. Every change has a test.

- **Scorer v3.** It closes the keyword-matching paths: copying the line, a different salt, a negation, a broader reason. The v2 scorer and every committed verdict stay unchanged.
- **Frozen baselines.** A rules parser, a constant answer and a copy control are published next to the models. The rules parser was written after reading the development sets, and it says so.
- **Evidence-safe harness.** The eval CLI refuses to overwrite results, randomizes order from a seed, records hashes, digests and load, and counts failures in latency.
- **Engine fixes.** Step aliases no longer hijack `{{input}}`, unclosed braces no longer swallow text, adapters enforce deadlines and report failures honestly, and prompt text stays on this machine unless code allows otherwise.
- **Interface copy.** The interface no longer promises "100% air-gapped" execution or shows invented savings.
- **Audit evaluator v3.** It scores facts and evidence separately.
- **Corrected documents.** Both sets are now labeled development data, the claims the evidence contradicts are corrected, and a blind test protocol is pre-registered.

None of this changed the prompts, schemas, labels or saved replies of the historical runs. The clinical decisions it raised are in [KEVIN-REVIEW.md](KEVIN-REVIEW.md).
