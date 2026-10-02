# SamJuniorsOS + SOFIA

One app, one port. The SamJuniorsOS operating system now carries **SOFIA** —
the voice-driven holographic assistant — as a first surface, in place of the
old Jarvis Lab.

```bash
bun install
bun run db:push        # once — SQLite for the OS's durable records
bun run dev            # http://localhost:3000
```

## The three surfaces

| Surface | What it is |
|---|---|
| **SOFIA** | The assistant. Talk to her — "hey sofia" (or type; the command line covers mic-blocked environments). She answers out loud and drives the interface as she speaks: cards, articles, galleries, orbits, her own colours — and the shell itself (see below). |
| **Sophia** | The executive neural canvas — the OS's founder-facing surface. |
| **SamJuniorsOS** | The company desktop: agents, workstreams, decisions, spotlight. |

## How SOFIA relates to the OS

- She **stays mounted for the whole session**, hidden (not torn down) behind
  the other surfaces — her microphone and her voice survive tab switches.
  She is the assistant of the OS, not of one pane.
- **When she speaks, she takes the interface.** Wherever you were working,
  the moment a reply starts her display becomes the visible surface again.
- Her `ui_os` tool lets her **switch surfaces in plain words**: "show me the
  desktop", "go to Sophia". The change arrives as a DOM event the shell
  listens for — inside this app it switches the surface; standalone
  (the [sofia-next](https://github.com/samjuniors/sofia-next) repo) it lands
  nowhere.
- While hidden, her WebGL render loop parks (mic and voice stay live), so
  the OS surfaces get the whole machine.

## The engines — chains where chains are real

The speech services are chains walked automatically when a link fails,
per phrase for STT (Deepgram → ElevenLabs → z-ai → local → the browser's own
recogniser), per sentence for TTS (ElevenLabs → z-ai neural → local → the
system voice).

The **LLM is deliberately not a chain**. R1 (honesty/consolidation) removed
the z-ai → Gemini → local ladder: it was only ever walked by a dead tool
loop (`src/lib/server/brain.ts`, zero importers — now deleted), while the
real conversation path talks to the pre-provisioned z-ai SDK directly. One
link, honestly reported — `/api/sofia/health` says exactly that.

**Zero-key start:** she runs with nothing configured — z-ai brain, z-ai
neural voices, browser speech recognition. Add keys to move up the speech
chains: copy `.env.example` to `.env.local` and fill what you want. Blank =
that link is off, honestly reported in the settings ENGINES fold and
`/api/sofia/health`.

## Governance (what every surface shares)

- **One execution authority** — tool calls that change anything run through
  the `SideEffectAuthorizationGate`: default-deny, payload-bound,
  occurrence-bound approval, canonical idempotency, forced audit. The
  realtime surface's direct tools (image generation, live web search) go
  through the same gate (R0).
- **One founder identity** — server-validated sessions
  (`POST /api/auth/founder-session`, HttpOnly cookies; header pairs for API
  clients). Production fails closed when the secret is unset (R0/R0.1).
- **Honest degraded paths** — when the model is unavailable, surfaces say
  so; nothing fabricates figures, approvals, inspections, or search
  results (R1).

## Setup

See **[docs/SETUP.md](docs/SETUP.md)** — zero-key quick start, speech
provider keys, verification workflow and a troubleshooting table.

## Merging the speech resilience layer into another project

See **[docs/MERGE_PROMPT.md](docs/MERGE_PROMPT.md)** — a self-contained
paste-ready prompt that specifies the speech resilience layer (chains,
breakers, status surface, acceptance tests) for any agent working in any
stack. (Its LLM-chain sections predate R1; this repo's brain is a single
z-ai link — see above.)

## Credits

Built on [adewaskar/jarvis](https://github.com/adewaskar/jarvis). Voice
 genders measured by FFT, not guessed. The plasma orb was retired in favour
 of the hologram with thanks for its service.
