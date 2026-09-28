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

## The engines — chains, not single points

Every service SOFIA depends on is a chain walked automatically when a link
fails, mid-turn for the LLM (z-ai → Gemini → any local OpenAI-compatible
server), per phrase for STT (Deepgram → ElevenLabs → z-ai → local → the
browser's own recogniser), per sentence for TTS (ElevenLabs → z-ai neural →
local → the system voice).

**Zero-key start:** she runs with nothing configured — z-ai brain, z-ai
neural voices, browser speech recognition. Add keys to move up the chains:
copy `.env.example` to `.env.local` and fill what you want. Blank = that
link is off, honestly reported in the settings ENGINES fold and
`/api/sofia/health`.

Full provider setup — Gemini, Ollama / LM Studio / vLLM, Deepgram,
ElevenLabs, faster-whisper, kokoro — is in [docs/sofia/SETUP.md](docs/sofia/SETUP.md).
To port the fallback layer into another codebase:
[docs/sofia/MERGE_PROMPT.md](docs/sofia/MERGE_PROMPT.md).
