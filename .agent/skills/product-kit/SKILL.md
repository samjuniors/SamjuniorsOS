---
name: product-kit
description: Use when working on the SamJuniorsOS roadmap, resuming interrupted work ("recover", "continue"), claiming steps for parallel agents, landing work on main, running a milestone QA pass, or recording a founder decision. Gives the milestone roadmap, the resume, git-sync and QA tool, the multi-agent protocol and the quality bar.
---

# Product kit

1. Read `AGENTS.md` first. It is binding; this kit never overrides it.
2. Stopped in the middle? Run `node .agent/product-kit/kit.mjs recover`. Otherwise run `node .agent/product-kit/kit.mjs continue` and do what it prints. When the founder says "continue", that is all you need. The order of work is the active milestone, never a gate.
3. Follow `.agent/product-kit/MASTER_PROMPT.md` (the only prompt) and `.agent/product-kit/PROTOCOL.md`.
4. Push and merge to main only through `checkpoint`, `land` and `milestone ship`, after the founder's `GIT-SYNC` authorization. Never deploy or install third-party tools without the founder's explicit instruction.
5. Record founder decisions only with the founder's own words (`decide`, `ack`).
