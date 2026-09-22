# SOFIA — a voice-driven holographic assistant (Next.js edition)

SOFIA is a JARVIS-style AI assistant you talk to. Say "hey sofia" (or type —
a command line covers environments where the microphone is blocked) and the
core answers out loud, showing what it finds on a heads-up display it drives
itself: cards, articles, galleries, orbiting images, its own colours.

This is the **Next.js edition** — the whole project in one framework on one
port (`:3000`): the React face, the brain, the speech engines and the
hardened proxies are all one app.

```
bun run dev          # http://localhost:3000 — that's the entire stack
```

## What's in the box

- **A live HUD** — a Three.js core (two avatars: the classic instrument dial,
  and SOFIA herself, a holographic entity of light) that follows the
  machine's state: cyan while listening, amber while thinking, violet while
  a tool runs, green while speaking, pulsing with your voice.
- **Three personas** — SOFIA (warm, no honorifics), JARVIS (dry, British,
  "sir"), NOVA (precise, near-machine). One click in settings swaps the
  wake word, the wordmark, the filler lines *and the brain's system prompt*
  mid-conversation.
- **14 tools the model can use** — web search, page reading, image search,
  image generation, URL probing, plus a whole interface kit (`display`,
  `blade`, `ui_theme`, `ui_reactor`, `ui_orbit`, `ui_chrome`, `ui_effect`,
  `ui_screen`, `ui_reset`) with which the assistant dresses its own display
  while it speaks.
- **Seven neural voices** (5 female, 2 male) — no key needed; the browser's
  speechSynthesis stays as the instant fallback; ElevenLabs wins
  automatically if you add a key.
- **Fallback chains everywhere** — see below. Nothing is load-bearing.

## The fallback chains (the headline feature)

Every external service is one link in an ordered chain, walked automatically
on failure, mid-turn:

| What | Chain (best first) | Enabled by |
|---|---|---|
| **LLM** (the brain) | z-ai (built-in, no key) → Google Gemini → any local OpenAI-compatible server (Ollama, LM Studio, vLLM, llama.cpp) | `GEMINI_API_KEY`, `LOCAL_LLM_BASE_URL` |
| **STT** (the ear) | Deepgram → ElevenLabs Scribe → z-ai ASR (no key) → local transcription server (faster-whisper, LocalAI) | `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `LOCAL_STT_URL` |
| **TTS** (the voice) | ElevenLabs → z-ai neural → local speech server (kokoro-fastapi, LocalAI) → the browser's own voice | `ELEVENLABS_API_KEY`, `LOCAL_TTS_URL` |

Rules the chains live by (all implemented in `src/lib/server/providers.ts`):

- **Failover within the same turn** — a provider failure walks to the next
  configured link before the user sees anything but a beat.
- **Circuit breakers** — a link that fails repeatedly is benched (90s LLM /
  60s STT) so a dead provider costs one attempt, not one per sentence. Any
  success heals it.
- **Stall guard, not timeout** — a slow local model is normal; a stream
  silent for 90s is dead, and the chain fails over.
- **Tool-schema latch** — small local models that reject function-calling
  get one tools-stripped retry, latched per provider.
- **Pins** — `SOFIA_LLM_PROVIDER` / `SOFIA_STT_PROVIDER` /
  `SOFIA_TTS_PROVIDER` collapse a chain to one link on purpose.
- **Honesty** — `/api/sofia/health` reports every link's state
  (LIVE/READY/COOLING/ERROR/OFF + the env var that turns it on), the HUD
  rail names the brain actually answering (with an amber FALLBACK badge
  when it isn't the primary), and the settings ENGINES fold re-probes on
  every open.

## Architecture (one app, one port)

```
src/
  app/
    page.tsx                 the one route — mounts the client-only SOFIA app
    layout.tsx               metadata
    api/sofia/
      ask/route.ts            POST  one turn, streamed back as SSE frames
      health/route.ts         GET   every chain's state
      tts/route.ts            POST  one spoken line as audio
      stt/route.ts            POST  one speech segment, transcribed
      img/route.ts            GET   remote images, proxied server-side
      media/route.ts          GET   remote video/audio, proxied (Range-aware)
      page/route.ts           GET   a whole web page, reader/live, frameable
      file/route.ts           GET   local image files (generated art)
  sofia/                     the client (ported from the Vite original)
    App.tsx                  the conversation state machine
    store.ts                 zustand store — phases, transcript, ui state
    scene/                   Three.js: Scene (Rig+Drive), Core (dial),
                             SofiaEntity (the hologram), Orbits
    ui/                      Hud, Blades, Panels, Settings, Ignition, …
    lib/                     voice loop, VAD, TTS, clap detector, personas…
  lib/server/
    providers.ts             every fallback chain, the breakers, the pins
    brain.ts                 the SSE tool loop (personas + 14 tools)
    voices.ts                the neural voice engine + catalogue
    net.ts                   hardened fetch: SSRF guards, redirect caps…
    page.ts                  reader/live page rendering
public/
  sofia/avatar-sofia.png    the holographic entity's plate
  sofia/art/                images generate_image makes
  audio/                    boot + ambient cues
```

The client talks to its own origin only — every remote byte (images, media,
articles) is fetched by the server through `net.ts`'s guarded pipeline, so
the page's attack surface stays local and hosts that refuse hotlinking still
render.

## Setup

See **[docs/SETUP.md](docs/SETUP.md)** — zero-key quick start, Gemini,
Ollama/LM Studio/vLLM, Deepgram/faster-whisper, kokoro-fastapi, verification
workflow and a troubleshooting table.

`.env.sample` documents every key with its default.

## Merging SOFIA into another project

See **[docs/MERGE_PROMPT.md](docs/MERGE_PROMPT.md)** — a self-contained
paste-ready prompt that specifies this whole resilience layer (chains,
breakers, latch, stall guard, status surface, acceptance tests) for any
agent working in any stack.

## Differences from the Vite edition (`github.com/samjuniors/sofianew`)

- One Next.js app on `:3000` instead of Vite + a bridge process on two ports;
  the WebSocket became an SSE stream (`/api/sofia/ask`).
- The browser's conversation history threads through every ask (the server
  is stateless per request — no session to lose on a dropped socket).
- Generated art saves under `public/sofia/art/` and is served as a normal
  same-origin URL.
- The camera/vision tools are not ported (an SSE stream is one-way; the
  server can no longer ask the page for a frame mid-turn). Hand-gesture
  control (MediaPipe) is ported and available with the `G` key.
- The in-browser kokoro TTS is not shipped; the server's neural voices
  cover it.

## Credits

Built on [adewaskar/jarvis](https://github.com/adewaskar/jarvis). Voice
 genders measured by FFT, not guessed. The plasma orb was retired in favour
 of the hologram with thanks for its service.
