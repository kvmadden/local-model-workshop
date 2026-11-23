# Amendment, 2026-11-23: the staged set is lost and is being rebuilt

This note sits beside the locked files of the first fresh blind set. It does not change `LOCK-NOTE.md`, `RUN-PLAN.md` or `lock.json`, which stay as registered.

1. **The text is lost.** The first set kept its lines and labels outside the repository by design, and only their hashes were committed here. That staged copy can no longer be found. Without it the hashes in `lock.json` cannot be checked against anything, no scoring run can be done on that set, and no result from it will be reported.
2. **No result was published from it.** The model passes described in `RUN-PLAN.md` were never scored against the lost labels, and nothing scored is being recovered from any other source.
3. **The set is rebuilt under the same protocol.** A new set is built in `eval/fresh-blind-set-v2/`, following `docs/FRESH-TEST-PROTOCOL.md` unchanged. Its convention sheet was frozen and committed before any line was written. Unlike the first set, its text and labels are committed in the repository, so it cannot be lost the same way.
4. **Lessons carried over.** The new set records both raw label sets, the dedupe record and the agreement table beside the lines. It is not locked and no model is run on it until Kevin has adjudicated every disagreement.
