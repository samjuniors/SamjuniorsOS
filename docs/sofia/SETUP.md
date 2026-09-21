# Setting SOFIA up — Next.js edition

One app, one port. `bun run dev` (or `npm run dev`) starts the whole stack —
page, brain, speech engines, proxies — on http://localhost:3000.

## Quick start (zero keys)

```bash
bun install        # or: npm install
bun run dev        # or: npm run dev
```

Open http://localhost:3000. You get:

- the brain on z-ai (built into this platform, no key)
- seven neural voices, no key
- server-side transcription on z-ai ASR, no key
- the browser's own speechSynthesis as the automatic floor

That is a fully working assistant. Everything after this section is about
making it *yours* — better links, local models, or both.

## The environment file

Next.js reads `.env.local` (gitignored) at boot. Copy the sample:

```bash
cp .env.sample .env.local
```

Blank or missing = that link is OFF, and `/api/sofia/health` says so, naming
the exact variable. Restart the dev server after editing — env is read at
boot (Next prints `Reload env: .env.local` when it notices a change in dev).

## A better brain

### Google Gemini (the one key worth having)

```bash
GEMINI_API_KEY=...           # from https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-2.0-flash   # optional; this is the default
```

The moment z-ai rate-limits or fails, the same turn fails over to Gemini —
the HUD rail switches to `BRAIN · GEMINI — FALLBACK` live. `GOOGLE_API_KEY`
is accepted as an alias.

### A local model (nothing leaves the machine)

Any OpenAI-compatible server works. **Ollama:**

```bash
ollama pull llama3.1        # or qwen2.5, mistral, …
OLLAMA_BASE_URL=http://localhost:11434    # the /v1 suffix is auto-added
# or: LOCAL_LLM_BASE_URL=http://localhost:11434
LOCAL_LLM_MODEL=llama3.1    # optional
```

**LM Studio** — start the local server (uses :1234 by default):

```bash
LOCAL_LLM_BASE_URL=http://localhost:1234
LOCAL_LLM_MODEL=<the model id LM Studio shows>
```

**vLLM / llama.cpp** — same pattern, point `LOCAL_LLM_BASE_URL` at the
server's base URL.

Notes: a slow first token is normal (the stall guard waits 90s); small
models that reject function-calling get one tools-stripped retry
automatically, latched per provider.

## A better ear

### Deepgram

```bash
DEEPGRAM_API_KEY=...
DEEPGRAM_MODEL=nova-3       # optional; default
```

### ElevenLabs Scribe

```bash
ELEVENLABS_API_KEY=...
```

(If you run Claude Code with the ElevenLabs MCP server configured, its key
is picked up automatically.)

### A local transcription server

faster-whisper / speaches / LocalAI — anything exposing the OpenAI
`/v1/audio/transcriptions` shape:

```bash
LOCAL_STT_URL=http://localhost:8000
LOCAL_STT_MODEL=whisper-1   # optional
```

The browser's own SpeechRecognition remains the last link, client-side.

## A better voice

### ElevenLabs

```bash
ELEVENLABS_API_KEY=...
SOFIA_VOICE_ID=JBFqnCBsd6RMkjVDRZzb   # optional; pick any voice id
```

### A local speech server

kokoro-fastapi / LocalAI / openedai-speech — anything exposing the OpenAI
`/v1/audio/speech` shape:

```bash
LOCAL_TTS_URL=http://localhost:8880
LOCAL_TTS_MODEL=kokoro
LOCAL_TTS_VOICE=af_sky
```

## Pins (testing, or preference)

```bash
SOFIA_LLM_PROVIDER=gemini   # or zai | local — collapse the LLM chain to one link
SOFIA_STT_PROVIDER=deepgram # or elevenlabs | zai | local
SOFIA_TTS_PROVIDER=local    # or elevenlabs | zai
```

(The `JARVIS_*` spellings from the bridge era still work as aliases.)

## Verifying your setup

```bash
curl -s localhost:3000/api/sofia/health | python3 -m json.tool
```

Every chain is in there: each link's `configured`, last state
(`never|ok|err`), whether it is benched (`cooling`), and which link is
`active`. In the app: settings gear → ENGINES fold — it re-probes on every
open and names the env var that turns each OFF link on.

To watch a failover happen: ask something, then kill the primary (stop the
Ollama server, revoke a quota) and ask again — the same turn answers on the
next link and the rail goes amber.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "every reasoning engine is unreachable" | No LLM link reachable. Check `/api/sofia/health`; if z-ai is 429 it is a quota window — it reopens on its own, or set `GEMINI_API_KEY`. |
| BRAIN · LOCAL but answers are odd | Small local model. Try a bigger one, or pin the chain back: `SOFIA_LLM_PROVIDER=zai`. |
| Voice input does nothing in an embedded pane | Browser policy — microphone requires a real tab. Use "Open in New Tab"; the typed command line covers embedded panes. |
| z-ai ASR shows OFF on a local checkout | z-ai credentials only exist on this platform. Add `DEEPGRAM_API_KEY` or a `LOCAL_STT_URL`. |
| Images in panels arrive blank | The proxy could not fetch that host. Nothing wrong with your setup — the model will say so. |
| A link says COOLING | It failed recently and is benched (90s/60s). It comes back on its own. |

## Gesture control (optional)

Press `G` to turn on hand tracking (MediaPipe hand-landmarker; WASM runtime
loads from the jsDelivr CDN, model from Google's model storage). Camera
permission is requested on first enable. `G` again to turn it off.
