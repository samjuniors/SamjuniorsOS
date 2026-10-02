#!/usr/bin/env python3
"""R1 surgery on providers.ts: remove the dead LLM chain, write honest llmInfo."""
import re, sys

P = '/home/z/my-project/src/lib/server/providers.ts'
src = open(P).read()

def must(pattern, repl, count=1, flags=0):
    global src
    new, n = re.subn(pattern, repl, src, count=count, flags=flags)
    if n != count:
        print(f'FAILED: expected {count} replacement(s) for pattern: {pattern[:80]}...')
        sys.exit(1)
    src = new

# 1. Header rewrite -----------------------------------------------------------
old_header = src[:src.index('import ZAI')]
new_header = '''/**
 * The resilience layer — the speech chains, in one place.
 *
 * The assistant is a conversation, and a conversation dies the moment one
 * sentence goes unanswered. Every external service it depends on — the
 * transcriber that hears, the voice that speaks — has a moment where it
 * rate-limits, times out, or simply goes down. So none of them is
 * load-bearing alone: each is one link in a chain, and the chain is walked
 * on failure, automatically, mid-turn.
 *
 *   STT   Deepgram → ElevenLabs Scribe → z-ai ASR (no key) → a local
 *         OpenAI-compatible transcription server (faster-whisper, LocalAI)
 *   TTS   ElevenLabs → z-ai neural → a local OpenAI-compatible speech server
 *         (kokoro-fastapi, LocalAI, openedai-speech) → the browser's own voice
 *
 * The LLM is deliberately NOT a chain. R1 (honesty/consolidation) removed the
 * z-ai → Gemini → local fallback ladder and the SSE tool loop that walked it
 * (brain.ts) — they had zero importers, while every production AI surface
 * (the Sophia turn executor, the agent executor, advisor, collaboration)
 * already talks to the pre-provisioned z-ai SDK directly through
 * src/lib/server/ai/zai-client.ts. llmInfo() below reports that one link
 * honestly; a fallback the production path never walks is a fallback you
 * can't trust.
 *
 * Three ideas make the chains safe rather than just long:
 *
 *   Circuit breakers. A provider that fails three times in a row (STT) is
 *   skipped for a cooldown — 60s — so a dead provider costs one failed
 *   attempt, not one per sentence. When every link is cooling the chain is
 *   walked anyway, in order: a retry is better than a shrug. Any success
 *   heals the provider immediately.
 *
 *   Pins. SOFIA_STT_PROVIDER / SOFIA_TTS_PROVIDER collapse a chain to one
 *   link on purpose — for testing, or because a person has decided they know
 *   better than the ladder. (The JARVIS_* spellings from the bridge era
 *   still work as aliases.)
 *
 *   Honesty. llmInfo() / sttInfo() are the single source of truth for
 *   /api/sofia/health, which is what the settings panel shows the user:
 *   which links exist, which are configured, which one is answering right
 *   now. A fallback you can't see is a fallback you can't trust.
 *
 * Ported from bridge/providers.mjs (Vite era) — behaviour identical; the env
 * vars gained SOFIA_* aliases and Next.js loads .env.local itself.
 */

'''
src = new_header + src[len(old_header):]

# 2. Remove LLM guard, sleep, isTransient, looksLikeToolRejection --------------
must(r"const LLM_GUARD = makeGuard\(2, 90_000\)\nconst STT_GUARD", "const STT_GUARD")
must(
    r"const sleep = \(ms: number\) => new Promise\(\(r\) => setTimeout\(r, ms\)\)\n",
    "",
)
# 2b. Remove isTransient + looksLikeToolRejection (string slicing) ------------
a = src.index('/** Errors worth one quick retry before the chain moves on. */')
b = src.index("// ---------------------------------------------------------------------------\n// Env plumbing", a)
src = src[:a] + src[b:]

# 3. Remove llmPinId -----------------------------------------------------------
must(
    r"function llmPinId\(\): string \{\n  return envAlias\('SOFIA_LLM_PROVIDER', 'JARVIS_LLM_PROVIDER'\)\.toLowerCase\(\)\n\}\n",
    "",
)

# 4. Replace the whole LLM chain section (from its banner to the STT banner) --
start = src.index('// The LLM chain — z-ai → Gemini → local.')
end = src.index('// The STT chain — Deepgram → ElevenLabs → z-ai → local.')
# keep the dashes banner line that precedes the STT banner
banner_start = src.rindex('// ---------------------------------------------------------------------------', 0, end)
new_section = '''// The brain — one provider, honestly reported.
//
// R1 (honesty/consolidation): the z-ai → Gemini → local LLM chain and its
// SSE tool loop (brain.ts) were removed — they had zero importers. Every
// production AI surface already routes through zai-client.ts, which talks
// to the same pre-provisioned SDK this module shares (zaiClient() below
// still exists for the ASR link). The shape of llmInfo() is unchanged so
// /api/sofia/health, the ask ready-frame and the settings panel need no
// client changes — it now reports the one link that actually answers.

export type LlmLinkInfo = {
  id: string
  label: string
  note: string
  configured: boolean
  healthy: boolean
  state: string
  cooling: boolean
  tools: boolean
  error: string | null
}

export type LlmInfo = {
  active: string
  label: string
  pin: string | null
  providers: LlmLinkInfo[]
}

/** What /api/sofia/health and the settings panel show about the brain.
 * There is no fallback ladder to walk — this is the single live link, and
 * `configured: false` is the honest "the z-ai SDK cannot start on this
 * machine" case rather than a claim that a key is missing. */
export function llmInfo(): LlmInfo {
  const configured = zaiAvailable()
  return {
    active: 'zai',
    label: 'Z-AI',
    pin: null,
    providers: [
      {
        id: 'zai',
        label: 'Z-AI',
        note: 'built-in, no key',
        configured,
        // 'never' reads as ready-to-serve, not broken; there is no chain
        // walk to record outcomes for a link that is the whole chain.
        healthy: configured,
        state: configured ? 'never' : 'err',
        cooling: false,
        tools: true,
        error: configured ? null : 'z-ai sdk is not available on this machine',
      },
    ],
  }
}

'''
src = src[:start] + new_section + src[banner_start:]

open(P, 'w').write(src)
print('providers.ts surgery complete')
