# .agent

Agent-facing material for SamJuniorsOS, kept in one folder so any coding agent can find it.

| Path | What it is |
|---|---|
| `product-kit/` | The roadmap (steps, milestones), the resume, git-sync and QA tool, the multi-agent protocol, the quality bar and the founder's vision. Start at `product-kit/MASTER_PROMPT.md`, the only prompt. |
| `product-kit/MILESTONES.md` | The order you test in and what is left. Say "continue" and the agent picks the next work. Gates are bookkeeping, not an order |
| `skills/product-kit/SKILL.md` | A short skill (the open SKILL.md format) pointing to the kit, for agents that load skills |

Stopped in the middle? Say "recover" (or `node .agent/product-kit/kit.mjs recover`). `node .agent/product-kit/kit.mjs install-hook` makes Claude Code run it at every session start.

How agents find this: `AGENTS.md` at the repository root carries a pointer to the kit, and `AGENTS.md` is the file most coding agents read. No agent is known to read `.agent/` by itself; that is NOT VERIFIED, so do not rely on the folder name alone.

The kit never overrides `AGENTS.md`, `PRODUCT.md` or `doc/ROADMAP.md`.
