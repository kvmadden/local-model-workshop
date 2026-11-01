# How this was built

Kevin Madden, PharmD, designed this workshop and its model-selection question. His review of the original medication schema identified that schedule and as-needed use needed separate fields. He reviewed the original synthetic labels and evaluates the clinical meaning of the results.

AI coding tools assisted with application code, tests, evaluation tooling and documentation. The extraction audit adds AI-proposed draft annotations to unchanged openFDA excerpts and a separate original synthetic challenge. Kevin has not yet reviewed these new annotations or any blind edits. There is no second independent reviewer recorded. The new draft work must not be attributed to him as completed labeling.

The audit uses the existing FlowRunner and Ollama adapter. Offline rescoring reads committed source snapshots, predictions and gold without accessing a model or network. It preserves the original schemas, prompts, labels, replies and published results.

The public excerpts are source-family split before inference. Their rights records link to openFDA's CC0 policy and the original label. The challenge is explicitly synthetic and dedicates its original text under CC0. No public text was planted or edited to insert answer values. There is no claim that synthetic items are indistinguishable from real labels.

The inspector reuses the app's Slate and Indigo tokens, theme controls and responsive layout. Its saved example is the narrow rules control, with the control identity and draft status visible. Model timing and quality claims require their own saved acquisition evidence.
