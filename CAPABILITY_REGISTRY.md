# CAPABILITY_REGISTRY.md — Known-Good Capabilities by Phase

> Read by CLAUDE.md Section 13's Discover step, alongside PRODUCT.md's "Current phase" field. When the phase changes, compare currently-connected capabilities against this table: propose additions the new phase needs, and flag (don't silently remove) capabilities that were phase-specific and are no longer relevant. Always a one-line proposal + confirm — never a silent install or uninstall, for the reasons in CLAUDE.md Section 13.
>
> **If a need isn't covered by this table:** check Anthropic's official plugin marketplace first, then well-established community aggregators (curated "awesome Claude Code" style lists) — rank candidates by whether they're official/first-party, stars, and how recently they were maintained. Present the top match with those signals visible (stars, last updated, official vs. community) so the founder can judge it, not just a name. Do not perform an open-ended GitHub/GitLab keyword search — that returns whatever matched, with no vetting at all, which is a meaningfully different (and worse) risk than a ranked, curated marketplace. Popularity narrows the field; it doesn't replace actually looking at what's being installed before confirming.

## Pre-approved (install without asking — already agreed as always-needed)
| Need | Capability |
|---|---|
| Repo / PR / issue operations | GitHub MCP (official) |
| Library/framework documentation | Context7 |
| Browser automation / E2E | Playwright MCP |

These three were explicitly agreed as core, every-project tools — Claude installs them at bootstrap without a per-project confirm. Everything below this line still gets a one-line proposal + confirm, since those needs are genuinely project- and phase-specific, not blanket-agreed in advance.

## Design / early build
| Need | Capability | Notes |
|---|---|---|
| Design source sync | Figma MCP (official) | Only if Figma is an actual source of truth |
| UI/UX review | `design-critic` subagent | Already in `.claude/agents/` |

## Pilot
| Need | Capability | Notes |
|---|---|---|
| Error monitoring | Sentry MCP (official) | Real users means real errors worth seeing |
| Production-readiness review | `production-hardening-reviewer` subagent | Security headers, rate limiting, logging, secrets handling — see `.claude/agents/` |
| Deployment management | Vercel MCP (official), or whatever Section 0's Deploy target actually is | Once deploys need monitoring/rollback from a session |
| Database | Supabase MCP (official) or Postgres MCP | Once there's a real database under real load |

## Production / scale
| Need | Capability | Notes |
|---|---|---|
| Payments | Stripe MCP (official) | Once billing is live, not before |
| Team communication | Slack MCP (official) | Once there's a team to notify |
| Issue/project tracking (if not GitHub Issues) | Linear MCP (official) | Only if actually used, not by default |

**Design-phase-only capabilities worth flagging for retirement once past pilot:** none of the design-phase items above are strictly design-only — Figma and `design-critic` both stay relevant as long as UI work continues. Flag a capability for retirement only when the phase it served is genuinely over and nothing in a later phase still needs it — most of these persist across phases rather than getting swapped out.

**Not on this list on purpose:** CRM, marketing, and analytics servers (HubSpot, etc.) — irrelevant until there's a go-to-market operation running.

**Before proposing any install:** confirm the need is real, confirm it's the official/first-party server where one exists, and always surface a one-line reason + a confirm prompt.

