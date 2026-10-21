# Capability request: GSD Core (agent workflow tool)

Status: REVIEWED 2026-10-20. Recommendation: do not adopt as the roadmap or state layer; optional one-step trial by the founder. Nothing installed. Confidence labels: Verified (read in a clone), Reported, Inference, Unknown.

## Need
A more mature way for agents to plan, execute and verify work inside a step, each in a fresh context.

## What was linked and what it is
- **Verified:** `github.com/gsd-build/get-shit-done` (the link you gave) is an archived redirect. Its README says GSD moved to `github.com/open-gsd/gsd-core`.
- **Verified:** the active repo is `open-gsd/gsd-core`, package `@opengsd/gsd-core` 1.18.0, MIT, last commit on its default branch 2026-10-19, requires Node >= 24 and npm >= 10. `PROGRESS.md` records this repository's tests running on Node v24.20.0, so the requirement is probably already met (NOT VERIFIED on your machine). The archived repo's last snapshot is numbered 1.50.0-canary.0; I did not find out why the numbers differ.

## What it does (from its README and file layout, not tested)
Discuss, plan, execute in parallel waves with a fresh context per executor, verify, ship. Project state lives under `.planning/` (PROJECT, ROADMAP, STATE, phases, config). It supports several agent runtimes and ships an MCP server and an SDK. It is large: many commands, agents, skills and tests.

## Permissions and risk
- **Verified:** the installer edits the agent runtime's configuration. `bin/install.js` mentions `settings.json` 62 times, registers hooks, and has 31 hook files. Hooks run code on agent events. It includes a guard hook against reading secret files, which is a good sign, but I did not audit the hook code.
- **Verified:** `bin/install.js` mentions "uninstall" 126 times, so removal code exists. How well it restores settings is NOT VERIFIED.
- **Inference:** `.planning/` is a second state system next to `gates.json`, `done/` and `handoffs/`. Two sources of truth is the failure mode this kit avoids.
- **Unknown:** whether the default install scope is user-level or project-level. Read `bin/install.js` before any trial.

## Comparison with this kit
| | GSD Core | This kit |
|---|---|---|
| Strength | Mature execution method: fresh-context executors, verification loop, many runtimes, large test suite | Product authority: founder decisions in the founder's own words, vision traced to gates and acceptance scenarios, production quality bar, resume after shutdown, fits `AGENTS.md` |
| Gap | Knows nothing about your vision, founder authority or this repo's rules | Had no independent verification or smallest-change discipline (now added) |
| Footprint | Large; edits agent config; Node 24 | One zero-dependency script, no install |

## Alternatives
1. Do without and borrow ideas. **Done:** `PROTOCOL.md` section 3 now requires a fresh session, a short plan, and independent verification, and `done` enforces the verification.
2. Trial on one low-risk step in a throwaway branch.
3. Adopt fully (rejected: duplicates the state layer and widens the permission surface).

## Recommendation
Keep the kit as the authority and roadmap. If you want to test GSD, run it yourself on step G1.1 only, in a throwaway branch, with a pinned version and after reading the installer. Compare against the plain kit on time taken, defects found by verification, and context problems. `gates.json` stays the only status source; never read `.planning/` for status. Remove it if the trial does not clearly win.

## Rollback
Use its uninstaller, then restore your agent settings from a backup you take before installing.
