# PRODUCT.md — Product Definition

> Filled from codebase audit (2026-09-07). Fields marked [inferred] are educated guesses from code — correct anything wrong.

## Current phase
Early build — core features being implemented

## Problem
Running an AI-powered company requires orchestrating multiple AI agents, tracking their work, making executive decisions, and managing company operations — all scattered across terminals, dashboards, and chat windows. There's no unified "operating system" that gives a solo founder a single cockpit for an autonomous AI workforce.

## Target users
Solo founder (Sam) — internal tool for running an AI company where AI agents handle most of the operational work. The founder is the executive, the agents are the workforce.

## Core idea (one paragraph)
SamJuniors OS is a desktop-OS-style internal operating system for an AI-run company. It presents a macOS-inspired desktop environment where each "app" is a different aspect of running the company — a workforce app to manage AI agents, a messaging app to chat with agents (powered by Gemini), an advisor for strategic counsel, company HQ dashboards for vitals and intelligence, plus finance, research, products, and customers apps. The OS itself handles window management, notifications, context menus, spotlight search, voice calling, and multi-agent collaboration workflows with governance and authorization.

## v1 scope
- macOS-style desktop shell (windows, dock, top bar, spotlight, control center, notifications)
- Workforce management — AI agent roster, roles, status, skill inspection
- Agent messaging — real-time chat with individual agents and councils, powered by Gemini API
- Advisor app — strategic AI advisor with context-aware reasoning
- Company HQ — pulse dashboard, active initiatives, attention items, decisions, deliverables, execution audit
- Collaboration workflows — multi-agent task orchestration, evidence modeling, context inspection
- Persona system — customizable agent personalities and tones
- Governance & authorization — side-effect authorization gate, workflow approvals
- Communication infrastructure — contacts, conversations, drafts, intents, webhooks
- Workflow engine — definitions, instances, scheduling, approvals
- Settings, notes, terminal apps
- Voice calling interface for agent interactions

## Explicitly out of scope (for now)
- Real external communication (email, Slack integration) — [inferred] communication APIs exist but are internally-scoped
- Multi-user / team support — single founder use only
- Persistent database — [inferred] appears to use in-memory/client-side stores
- Mobile support — desktop-first OS metaphor
- Public deployment / auth — internal tool, no auth layer needed
- Real payment processing — Finance app is informational

## Constraints
- Timeline: No fixed deadline — iterative build
- Solo/team: Solo founder
- Budget/hosting constraints: Gemini API (server-side), local-first development
- Anything non-negotiable: macOS-style desktop metaphor; Gemini as the AI backbone; agent-first architecture where agents are "employees"

## Stack
- Next.js 15 / React 19 / TypeScript 5.9
- TailwindCSS 4 with PostCSS
- Framer Motion (via `motion` package)
- Gemini API (`@google/genai`)
- Composio (`@composio/core`) for tool integration
- Lucide React for icons
- React Markdown for rich content rendering
- CVA + clsx + tailwind-merge for component styling

## Success criteria for v1
- All core apps functional and interconnected [inferred]
- Agent messaging works end-to-end with Gemini
- Collaboration workflows execute with proper authorization
- OS shell feels cohesive — windows, notifications, dock, spotlight all working
- Persona system lets founder customize agent behavior

## Open questions
- Should agents persist memory across sessions? (currently appears ephemeral)
- Is Composio actively used, or placeholder infrastructure?
- What's the deployment target? (currently dev-only)
- Should the communication/webhook APIs connect to real external services?
