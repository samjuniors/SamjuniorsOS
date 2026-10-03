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

## The brain (single provider, no keys)

The LLM is one link: the platform's z-ai SDK, built in and pre-provisioned —
there is nothing to configure. R1 (honesty/consolidation) removed the old
z-ai → Gemini → local fallback ladder and the `GEMINI_API_KEY` /
`LOCAL_LLM_*` variables: the production conversation path never walked that
chain (every AI surface talks to the SDK directly), so the settings panel
advertising those links was a fallback you could not actually get. If z-ai
is rate-limited the honest answer is a beat and a retry — the settings
ENGINES fold shows the one brain link and its state.

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

To watch a failover happen: speak a phrase with the primary transcriber
blocked (no key set, local server stopped) and the STT chain walks to its
next link. The brain has no chain to fail over — one honest link.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "every reasoning engine is unreachable" | The z-ai backend is rate-limited or unavailable. Check `/api/sofia/health`; a 429 is a quota window — it reopens on its own. |
| Voice input does nothing in an embedded pane | Browser policy — microphone requires a real tab. Use "Open in New Tab"; the typed command line covers embedded panes. |
| z-ai ASR shows OFF on a local checkout | z-ai credentials only exist on this platform. Add `DEEPGRAM_API_KEY` or a `LOCAL_STT_URL`. |
| Images in panels arrive blank | The proxy could not fetch that host. Nothing wrong with your setup — the model will say so. |
| A link says COOLING | It failed recently and is benched (90s/60s). It comes back on its own. |

## Gesture control (optional)

Press `G` to turn on hand tracking (MediaPipe hand-landmarker; WASM runtime
loads from the jsDelivr CDN, model from Google's model storage). Camera
permission is requested on first enable. `G` again to turn it off.
