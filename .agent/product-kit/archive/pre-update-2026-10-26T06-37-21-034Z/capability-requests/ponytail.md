# Capability request: Ponytail (agent coding rules)

Status: REVIEWED 2026-10-20. Recommendation: borrow the idea as text (done); do not install the plugin. Nothing installed. Update 2026-10-23: the ladder is now enforced by the kit itself (handoff section, verifier's over-engineering check, size limits in `done`), so no plugin is needed.

## Need
Stop agents over-building. This matters for AI-assisted development under `AGENTS.md` ("no speculative implementation", "check for duplication").

## Provenance
- **Verified (clone):** canonical source is `DietrichGebert/ponytail`, package `@dietrichgebert/ponytail` 5.3.2, MIT, no runtime dependencies, last commit 2026-10-18.
- **Verified (search results):** several copies and forks exist under other accounts (for example DKFish, Adek06, djpken, mikrammullah). Use only the canonical author's repository.
- **Reported (the project's own claim, not measured by me):** it writes substantially less code. Treat the figure as unverified.

## What it is
A short rule set (an `AGENTS.md`) that makes the agent ask, in order: does this need to exist, is it already in the codebase, does the platform or an installed dependency already do it, otherwise write the minimum. It never cuts validation at trust boundaries, data-loss handling, security or accessibility, and it asks the agent to mark shortcuts. An optional plugin adds commands and startup hooks.

## Risk
- **Verified:** the plugin ships Node hooks that run when the agent starts; one uses `child_process`. I did not audit them.
- **Inference:** installing its `AGENTS.md` would collide with this repository's binding `AGENTS.md`.

## Recommendation
Use the ladder as written text. It is rewritten into `PROTOCOL.md` section 3 with attribution, and it needs no install. Revisit the plugin only if agents keep over-building after the rule is in place.
