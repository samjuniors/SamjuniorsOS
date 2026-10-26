# Capability discovery (skills, plugins, MCP servers, subagents)

Extends `CLAUDE.md` section 13 (Discover, Reuse, Adapt, Create, Use, Review, Retire). Does not relax its installation boundary.

This file governs the tools the **building agents** use. The tools Sofia and her employees use at runtime are governed by gate G14 and `VISION.md`; the same vetting principles apply.

## Use without asking
Anything already installed, or listed as pre-approved in `CAPABILITY_REGISTRY.md`, when the step actually benefits.

## When something is missing: research, then request, then keep working
1. Check whether the step can be done reliably without it. If yes, do that.
2. Search the project (`.claude/agents/`, `.claude/skills/`, installed plugins, connected MCP servers) and `CAPABILITY_REGISTRY.md`.
3. If still missing, research candidates from primary sources (the publisher's repository and documentation) and write `capability-requests/<slug>.md`:
   - need, and which step it serves;
   - at least two candidates, or the statement that only one was found, plus the option of doing without;
   - provenance: publisher, repository, license, last release, pinned version;
   - permissions it requests (filesystem, network, shell) and what data it could read;
   - whether it fetches or runs code at runtime;
   - recommendation, cost, and how to remove it.
4. Ask the founder for a one-line confirmation. Batch requests so one reply unblocks several. Do not install before the reply.
5. While waiting, work on any other ready step. A pending request must never idle a lane.

**Why not install automatically:** agentic supply-chain vulnerabilities are a named category (ASI04) in the OWASP Top 10 for Agentic Applications 2026. An unvetted tool or MCP server runs with the agent's permissions. The one-line confirm costs seconds; skipping it is the largest single way an agent project gets compromised.

## Prompt phrases that route to the right capability
Use the repo's own names. Check that each exists before relying on it.

| Task | Look for |
|---|---|
| Framework or library documentation | Context7-style documentation MCP |
| Browser end-to-end tests | Playwright |
| Repository and pull-request operations | GitHub integration |
| Runtime performance debugging | Chrome DevTools |
| Implementing from a design file | Figma |
| Web research and page extraction | Firecrawl |
| Agent workflow method | Reviewed, not installed: `capability-requests/gsd-core.md`, `capability-requests/ponytail.md` |
| Independent review roles | `architecture-reviewer`, `security-reviewer`, `design-critic`, `production-hardening-reviewer`, `qa-reviewer`, `progress-auditor` |

`PROGRESS.md` says these six subagents exist under `.claude/agents/` on the founder's machine, but `.claude/` is not tracked in the repository. At the start of a run, check `ls .claude/agents`. If it is missing, open a finding asking the founder whether to commit them, and do not recreate them silently.

## Lifecycle
At each gate boundary list what was used, what was never used, and what overlaps, and propose retirements (`CLAUDE.md` 13, Lifecycle).
