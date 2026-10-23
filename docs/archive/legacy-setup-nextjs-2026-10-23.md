> **ARCHIVED ON 2026-10-23:** This is an exact copy of the previous `docs/SETUP.md` from `kit/integration` before the docs reconciliation. It describes an older Next.js/dev-runner setup and must not be treated as installation instructions for the Vite/Express branch. Current guide: [docs/SETUP.md](../SETUP.md).

---

# Setting SamJuniorsOS up locally

Verified against the working tree on 2026-10-21 on Windows 11 (Node 24, npm) and on 2026-10-15 (Linux, Node 22, Bun 1.4.3).

## What you get

- **Dashboard:** http://localhost:3000 (the app runs on port 3000; the port is set in `scripts/dev.mjs`).
- **COO chat:** Sophia Vance, through `POST /api/agent-chat`.
- **Live companion WebSocket:** port 3001; `npm run dev` starts it alongside Next.js for local voice sessions.

## Known issues to read before installing

These were all reproduced on 2026-10-15. Until they are fixed, the steps below include the workaround.

1. **Lockfile registry host: NOT VERIFIED as a problem.** `bun.lock` contains 609 tarball URLs on `registry.npmjs.com` rather than `registry.npmjs.org`. An earlier version of this guide called that a broken host. That was wrong: the failure was observed only in a restricted sandbox whose network allowlist blocks the host (a host that certainly exists failed the same way there), and the repository's CI installs with `bun install --frozen-lockfile` against this lockfile. If `bun install` fails on your machine with `DNSResolveFailed`, check your own network or proxy before touching the lockfile.
2. **Windows-only SWC binary is declared under optionalDependencies (Resolved in Gate G1.6).** `@next/swc-win32-x64-msvc` is declared in `optionalDependencies` rather than hard dependencies. npm and bun install it on Windows x64 and cleanly skip it on Linux and macOS without `EBADPLATFORM` errors.
3. **The postinstall step downloads Prisma engines.** `postinstall` runs `prisma generate`, which fetches engine binaries from `binaries.prisma.sh`. If that host is blocked on your network, the install fails. You can install with `--ignore-scripts` and run `bunx prisma generate` (or `npx prisma generate`) once the host is reachable.

## Install

```bash
git clone https://github.com/samjuniors/SamjuniorsOS.git
cd SamjuniorsOS
npm install                 # or: bun install (verified cross-platform on Windows and Linux)

# Copy environment template for both Prisma and Next.js
cp .env.example .env
cp .env.example .env.local

# Push schema to SQLite database (reads DATABASE_URL from .env)
npm run db:push
# (or: bun run db:push)
```

Start the app:

```bash
bun run dev                 # or: npm run dev
```

For a standalone gateway process (for example, when running Next.js separately):

```bash
bun run dev:ws              # port 3001, or LIVE_WS_PORT
```

The local dev runner shares a temporary signing secret between Next.js and the
companion process and enables the local gateway unless
`SAMJUNIORS_VOICE_GATEWAY` is explicitly disabled. Add `DEEPGRAM_API_KEY` to
`.env.local` for streamed speech recognition. Without that key, the browser
uses its speech-recognition API and sends the transcript to the authenticated
canonical Sophia chat endpoint.

## Verify

These endpoints returned as shown on 2026-10-15:

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/                 # 200
curl -s localhost:3000/api/agents | head -c 200                           # 200, 4 agents
curl -s localhost:3000/api/sophia/status | python3 -m json.tool          # provider flags
```

Chat with the COO. Development accepts role headers; production rejects them.

```bash
curl -s -X POST localhost:3000/api/agent-chat \
  -H 'content-type: application/json' \
  -H 'x-samjuniors-role: FOUNDER' \
  -H 'x-samjuniors-user-id: local' \
  -d '{"agentId":"coo","message":"hello","history":[]}'
```

Check `"liveAi"` in the response. `false` means the reply came from the deterministic fallback, not a live model.

**Note:** `/api/sofia/health` now returns `410 Gone` (the legacy voice path was retired in Phase 5). Use `/api/sophia/status` instead.

## What makes Sofia answer live

The COO's conversation path calls `generateText` in `src/lib/server/ai/zai-client.ts`, which uses the z-ai SDK only. The intent classifier uses the same client. Without z-ai credentials, the chat logs `Configuration file not found or invalid. Please create .z-ai-config`, and the reply falls back to deterministic text with `liveAi: false`.

The Gemini, Anthropic, Ollama, and LM Studio variables in `.env.example` are present in the codebase, but the chat path above does not use them. Setting those keys does not make the COO conversational. **Result on a plain local checkout today: Sofia cannot hold a live open-topic conversation.** Closing that gap is on the roadmap as a provider decision, not a configuration step.

Speech (below) is a separate path. Its keys and servers are listed in the sections that follow. I did not verify speech end to end in this check.

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

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `EBADPLATFORM` for `@next/swc-win32-x64-msvc` | Known issue 2. Use `bun install` on macOS or Linux. |
| `DNSResolveFailed` for `registry.npmjs.com` | Usually your network or proxy. See known issue 1; do not edit the lockfile on this evidence alone. |
| `binaries.prisma.sh ... ENOTFOUND` | Known issue 3. Your network blocks the Prisma engine host. |
| `/api/sofia/health` returns 410 | Expected. The legacy voice path is retired. Use `/api/sophia/status`. |
| Chat replies look fine but `liveAi` is `false` | Deterministic fallback. The z-ai client is not configured. See "What makes Sofia answer live." |
| `Configuration file not found or invalid. Please create .z-ai-config` in the log | z-ai credentials are missing on this machine. |
| Voice input does nothing in an embedded pane | Browser policy. The microphone needs a real tab. Use "Open in New Tab". |
| Images in panels arrive blank | The proxy could not fetch that host. |
| A link says COOLING | It failed recently and is benched (90s/60s). It comes back on its own. |

## Gesture control (optional)

Press `G` to turn on hand tracking (MediaPipe hand-landmarker; WASM runtime
loads from the jsDelivr CDN, model from Google's model storage). Camera
permission is requested on first enable. `G` again to turn it off.
