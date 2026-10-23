# Merge prompt — porting SOFIA's resilience layer into another project

Copy everything between the lines below into your agent (Claude Code, Cursor,
whatever). It is self-contained: it specifies the whole fallback layer the
way this repo implements it (see `src/lib/server/providers.ts` for the
reference implementation), so the agent can rebuild it in your stack without
this codebase present.

---

**Task: add a provider-fallback ("resilience") layer to my app.**

My app depends on three kinds of external service — an LLM (the "brain"), a
speech-to-text API (the "ear"), and a text-to-speech API (the "voice").
Today each is a single hard dependency: when it rate-limits, times out or
goes down, the feature dies in front of the user. I want each dependency to
become an ordered **chain** of providers, with automatic failover, so the
service keeps working when any one link fails.

**Chains (in priority order):**

1. LLM: primary (my current provider) → Google Gemini → any local
   OpenAI-compatible server (Ollama / LM Studio / vLLM / llama.cpp).
2. STT: Deepgram → ElevenLabs Scribe → primary → local OpenAI-compatible
   transcription server.
3. TTS: ElevenLabs → primary → local OpenAI-compatible speech server →
   the platform's built-in fallback (e.g. the browser's `speechSynthesis`).

**Requirements:**

- **One module owns all chains** (e.g. `lib/server/providers.ts`). Each
  provider is a small adapter with: `id`, `label`, `available()` (is it
  configured?), `start()`/`transcribe()`/`synthesize()` (the call), and a
  `note` naming the env var that enables it.
- **Failover, not retry-forever.** On failure, walk to the next configured
  link within the same request. Give each link at most one quick retry
  (≈600ms) for transient errors (429 / 5xx / network) before moving on.
- **Circuit breakers.** A link that fails 2 (LLM) / 3 (STT) consecutive
  turns is *benched* for 90s / 60s and skipped — a dead provider must not
  cost one failed call per sentence. When every link is benched, walk the
  chain anyway (a loud retry beats giving up). Any success heals the link
  immediately.
- **Stall guard, not request timeout, for streams.** A slow first token from
  a local model is normal; a connection silent for 90s is dead. Race each
  stream read against a stall timer, and fail over on stall.
- **Tool-schema degradation.** Small local models often reject OpenAI
  function-calling schemas. If a link errors in a way that looks like a
  tool rejection (400/422/"unsupported"/"tools"/"functions" — but NOT a
  plain 404), retry that link once with the tools stripped, and latch it so
  the retry is paid once per provider, not per turn.
- **Pins.** Env vars `APP_LLM_PROVIDER`, `APP_STT_PROVIDER`,
  `APP_TTS_PROVIDER` collapse a chain to exactly one link (for testing or
  on purpose). Empty/absent = full automatic chain.
- **Honesty — the status surface is part of the feature:**
  - a `/health` (or equivalent) endpoint returning every chain: each link's
    `configured`, last state (`never|ok|err`), whether it's benched, and the
    active link;
  - a live event/notification when the active LLM link *changes*, so the UI
    can show which engine is answering (e.g. a "BRAIN · GEMINI — FALLBACK"
    indicator);
  - a read-only settings/panel view of the chains: LIVE / READY / COOLING /
    ERROR / OFF per link, each OFF row naming the env var that turns it on.
    Keys are configured via env file, never entered in the UI.
- **Env contract** (document in `.env.sample`; blank = link off):
  - LLM: `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.0-flash`),
    `LOCAL_LLM_BASE_URL` (append `/v1` if missing; accept `OLLAMA_BASE_URL`
    as an alias), `LOCAL_LLM_MODEL` (default `llama3.1`),
    `LOCAL_LLM_API_KEY`.
  - STT: `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL` (default `nova-3`),
    `LOCAL_STT_URL`, `LOCAL_STT_MODEL`, `LOCAL_STT_API_KEY`.
  - TTS: `ELEVENLABS_API_KEY`, `LOCAL_TTS_URL`, `LOCAL_TTS_MODEL`,
    `LOCAL_TTS_VOICE`, `LOCAL_TTS_API_KEY`.
- **Wire-format notes:**
  - Gemini's OpenAI-compatible endpoint is
    `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
    with `Authorization: Bearer <key>`; it streams the same SSE shape
    (`data: {"choices":[{"delta":{...}}]}` … `data: [DONE]`) and supports
    function calling. This means ONE parser can serve every LLM link.
  - Local servers: Ollama at `http://localhost:11434/v1/chat/completions`;
    transcription via multipart POST to `/v1/audio/transcriptions`
    (file + model, response `{text}`); speech via JSON POST to
    `/v1/audio/speech` (model/voice/input, response = audio bytes).
  - Deepgram: raw audio bytes POSTed to
    `https://api.deepgram.com/v1/listen?model=<m>&smart_format=true` with
    `Authorization: Token <key>`; transcript at
    `results.channels[0].alternatives[0].transcript`.

**Acceptance tests** (write them, then make them pass):

1. With the primary up: it answers; chain status shows it LIVE.
2. Kill the primary (point it at a dead port / revoke quota): the next
   configured link answers *the same request*, the active-link event fires,
   and the status surface shows the failover.
3. With everything down: the request fails gracefully with a message naming
   what was tried; the client-side last resort (e.g. browser speech) takes
   over where one exists.
4. A provider failing repeatedly gets benched (no per-request dial), and
   recovers automatically after the cooldown.
5. `curl /health` reflects reality after every scenario.

**Reference implementation** (TypeScript, Next.js route handlers):
`src/lib/server/providers.ts` in this repo — the breaker factory, the chain
walker, the tool-schema latch and the status plumbing are all there with
comments explaining each rule, plus `src/app/api/sofia/health/route.ts` for
the status endpoint and `src/lib/server/brain.ts` for the announce-on-switch
wiring. The same layer was originally built and verified against a live z-ai
429 outage with a fake OpenAI-compatible server standing in for "local"
(the failover, the announcement, the honest 503s and the /health states were
all observed end-to-end through the real UI).
