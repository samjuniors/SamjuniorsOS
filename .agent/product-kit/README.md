# Product kit

A resumable, milestone-by-milestone work system so AI agents can take SamJuniorsOS from its current state to a production-grade product, several agents at a time, without losing their place when a session ends or the computer shuts down.

**One prompt starts or resumes everything:** paste `MASTER_PROMPT.md` into your coding agent. It is the only prompt; it replaces any earlier copy. The order of work is the milestones in `MILESTONES.md` and the agent finds it with `continue`. Gates below are bookkeeping groups of steps, never an order. `VISION.md` holds the founder's vision (greeting, memory, decision engine, AI employees, tools, product takeover) how each part is built and proven, and what to reuse from the open-source ecosystem.

## What this is and is not

- It **adds** a roadmap with exit evidence, a claim-and-resume mechanism, a multi-agent protocol, a production quality bar and a capability-discovery procedure.
- It **does not replace** the repo's rules. `AGENTS.md` is binding; `CLAUDE.md` is the engineering operating system; `CONTINUE.md` is the resume protocol; `PROGRESS.md` is the ledger.
- It **cannot** make one prompt finish the product. Progress is bounded by founder decisions (the G0 decisions) and by the founder's acceptance of each milestone. The kit's job is to make every other hour productive and every stop recoverable.

## How the gates relate to `doc/ROADMAP.md`

Gate IDs are stable names, not an ordering; `GATES.md` shows the order of work as waves. If this kit and `PRODUCT.md` or `doc/ROADMAP.md` disagree, those documents win. The agent logs a finding in `findings/` and does not proceed on the disputed step.

| Kit gate | Roadmap position |
|---|---|
| G0 decisions | Open founder decisions listed in ROADMAP "Next action" and PRODUCT.md |
| G1 baseline integrity | Evidence gaps in FOUNDATION (full tests, CI, honest fallback) |
| G2 persistence and deploy | NEXT: Phase 2.3C (still needs explicit authorization) |
| G3 security | NEXT: open auth gaps, plus new threat-model work |
| G4 single company brain | NEXT: Company Brain single path, Artifact model, GitHub adapter |
| G5 core loop v1 | NEXT: Founder Operating Loop (pending ratification) |
| G6 Sofia live conversation, G7 Windows node | LATER (voice, local node) |
| G11 memory, G12 decision engine, G14 capability layer, G13 AI workforce, G15 product ownership, G16 vision acceptance | The founder's vision of 2026-10-20 (`VISION.md`). Builds on `PRODUCT.md` sections 7 to 9. Each starts only when its gate is verified and the founder authorizes it |
| G8 UX polish, G9 release readiness | New: production polish and operability |
| G10 public productization | Not applicable now: the founder decided on 2026-10-20 to use it for himself and design for scaling later without implementing it. Kept as a conditional gate (`ack NA-G10` recorded) |

## Commands

Run from any checkout or worktree: `node .agent/product-kit/kit.mjs <command>`

| Command | Use |
|---|---|
| `recover` | After any stop: what is finished, what was interrupted, what is not on main yet, what is next. Read-only. `install-hook` makes Claude Code run it at every session start |
| `checkpoint [--all]` | Secret scan, commit, push the step branch (never main). `--all` does every worktree: run it before leaving a computer |
| `reconcile` | On a new computer or folder copy: restore worktrees, claims and branches from the remote |
| `layout check` / `report` / `init` | Keep files where `LAYOUT.md` says |
| `migrate-folder` | Rename `.agent/` to `.agents/` and fix every path that mentions it |
| `sync` | Push commits that sit on the integration branch but not on the remote (decisions, PROGRESS.md), after the checks and CI pass |
| `ci check` / `ci wait` | Check that `gh` and the workflows are ready; wait for CI on a branch |
| `land <ID>` | Lead only: bring the integration branch into the step, wait for CI, run the checks, merge, push, clean up |
| `qa start <M>` / `qa check <M>` | The QA pass before the founder tests a milestone |
| `milestone ship <M>` | After close: CI, release the integration branch to main, tag, push, leave the repository clean |
| `doctor` | Finds older kit wording (gate-by-gate, kit/integration) in other files |
| `continue` | What to do next: interrupted work to take over, ready steps of the active milestone, decisions to ask. The founder only has to say "continue" |
| `status` | Every gate and step with its state |
| `next --n 4` | Up to four ready steps that do not conflict on files, spread across lanes |
| `resume` | After an interruption: claims, stale claims, step worktrees, uncommitted work |
| `claim <ID> --agent NAME` | Take a step: atomic claim, branch `step/<ID>`, own worktree |
| `heartbeat <ID>` | Keep a claim fresh (stale after 30 minutes without one) |
| `scaffold <ID>` | Create the handoff and verification templates for a step |
| `done <ID> --evidence "..."` | Record completion (requires a handoff note and an independent PASS from a second agent session) |
| `release <ID>` | Lead only, after integration |
| `decide <ID>` / `ack <KEY>` | Record a founder decision or acknowledgement (including `GIT-SYNC`), quoting the founder's own words |
| `milestone status` / `verify <M>` / `close <M>` | List milestones; give the founder the test script; after acceptance, clean up and start the next milestone |
| `render` / `validate` | Regenerate `GATES.md` and `MILESTONES.md` and check the roadmap for errors |

## How resuming works

Claims live in the git common directory, shared by every worktree and kept across restarts. Completion is a committed file (`done/<ID>.json`) that travels with the work, so there is no shared state file for agents to collide on. After a shutdown, `resume` shows what was claimed, what is stale, and which worktrees hold uncommitted work. The agent takes over stale claims and continues in the same worktree.

## What the founder does

1. Answers the decisions when `continue` lists them, using the briefs in `briefs/`.
2. Once, authorizes git sync (`ack GIT-SYNC`) so the agent can push, and release to `main` once per milestone.
3. At the end of each milestone, after the agent's own QA pass, tests it with the script in `MILESTONES.md` and tells the agent how it went, in your own words. At any other time, just say "continue".
4. Confirms any new tool or integration an agent proposes (`CAPABILITIES.md`).

Everything else is meant to proceed without you.

## Verified and not verified

- Verified (2026-10-20, Linux, Node 22, scratch copy): `render`, `validate`, `status`, `next`, `claim` (including refusal on file conflict and on duplicate claim), stale detection, takeover, refusal of `done` without a handoff or evidence, `decide`, `ack` (including refusal to close a gate with undone steps), and state after merge.
- NOT VERIFIED: behavior on Windows, and use with several real agent sessions at once. Treat the first real run as a test of the kit itself.
