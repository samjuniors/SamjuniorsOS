# Layout: where every file goes

One place per kind of file. Kit commands write only to the places below, and `done` and `land` refuse new files that land anywhere else. `layout check` shows what would be refused; `layout report` lists existing files that are outside this map (informational: moving old files is a founder decision, never automatic).

| Kind | Location | Written by |
|---|---|---|
| Agent instructions (binding) | `AGENTS.md` at the root. `CLAUDE.md` at the root is the Claude Code adapter and may be a short pointer | the founder, small edits by agents |
| Kit tool, roadmap, protocol, quality bar | `.agents/product-kit/` | the kit |
| Helper reports | `.agents/product-kit/handoffs/<ID>.research.md`, `.test.md`, `.debug.md`, `.review.md` | helpers |
| Last-work journal | `.git/kit/journal.jsonl` (local, never committed) | kit commands |
| Kit state | `.agents/product-kit/` subfolders: `done`, `ack`, `handoffs`, `findings`, `qa`, `briefs`, `capability-requests`, `archive` | kit commands |
| Skills | `.agents/skills/<name>/SKILL.md` | the kit, the founder |
| Claude Code adapters (hook, `/recover`, skill pointer) | `.claude/` | `install-hook` |
| Human documents: specs, ADRs, setup | `docs/` (ADRs in `docs/adr/`) | agents |
| Running log | `PROGRESS.md`, `CONTINUE.md` at the root (existing files) | agents |
| Source | `src/` and the folders the ADR from step MX.1 names; tests in `tests/` | agents |
| Step working copies | a sibling folder `<repo>-wt/` outside the repository; temporary, `land` removes each | `claim`, `reconcile` |
| Never committed | build output (`.next`, `dist`, `build`, `coverage`), logs, `.env`, backups (`*.bak`, `*~`), loose screenshots | nobody |

**Folder name.** `.agents/` is the shared home for agent material (`AGENTS.md` and `.agents/skills/` are the convention reported for Codex, Cursor and others). Claude Code reads `CLAUDE.md` and `.claude/` instead, so `.claude/` only holds thin adapters. Nothing is duplicated beyond a few pointer lines. `migrate-folder` renames an existing `.agent/` to `.agents/` and updates every path that mentions it.

**Existing scatter.** `layout init` records today's top-level files and folders as allowed, so only NEW strays are flagged. If the repository has both `doc/` and `docs/`, or loose documents at the root, step MX.6 proposes a tidy-up; nothing moves until the founder says yes.

**What the check is.** A set of simple rules (new root files, new top-level folders, documents outside `docs/`, backup and log files, committed build output, unknown folders inside the kit). It is a heuristic. To allow something on purpose, the founder adds it to `layout.allowedTopLevel` or `layout.extraDocRoots` in `kit.config.json`, or approves one landing with `--allow-layout "<reason>"`.
