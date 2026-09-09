# CONTINUE.md — Resume Protocol

Run this instead of the bootstrap interview when picking up an existing project.

1. Read `CLAUDE.md` and `PRODUCT.md` in full — don't re-derive decisions already made there.
2. Read `PROGRESS.md` — this is the real record of what's done, what's in progress, what's been audited, and what's next. Trust it over guessing from the diff.
3. Cross-check against `git log` and `git status` — if the code doesn't match what PROGRESS.md claims (something marked done isn't actually there, or vice versa), flag the mismatch before proceeding rather than silently trusting either source.
4. Run CLAUDE.md Section 13's lifecycle check on this project's subagents and skills — what's still used, what's redundant, what's missing for where the project is now. Check PRODUCT.md's "Current phase" field against `CAPABILITY_REGISTRY.md`: if the phase has moved since last session, propose what the new phase needs and flag (don't remove) anything that's genuinely phase-specific and no longer relevant. Also run `progress-auditor` on PROGRESS.md's recent Completed and Audit Log entries — don't take your own prior session's claims at face value.
5. Summarize state back in a few lines: what's done, what's in progress, what's the obvious next step — then proceed.
6. Only ask the founder something if it's genuinely blocking (a real decision point, not something answerable from the repo) or if PRODUCT.md and the actual code have drifted apart and need reconciling.
7. Continue building under CLAUDE.md's rules — same spec-gate, same ask-vs-proceed logic, same completion standard as a fresh session.
