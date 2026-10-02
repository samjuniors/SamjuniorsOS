/**
 * SOFIA configuration — Next.js edition.
 *
 * The Vite build read everything from import.meta.env because the browser
 * and the bridge were two processes on two ports. In the Next.js app they
 * are one origin: the page and every service route (/api/sofia/*) live on
 * :3000 together, so almost all of that configuration collapses to "talk to
 * yourself".
 *
 * The keys that remain meaningful live in the server's environment now
 * (.env.local read by Next at boot) — see SETUP.md for the full ladder.
 */

/** The API root — same origin, so relative paths everywhere. */
export const API_BASE = '/api/sofia'

/**
 * Kept as an export because half the client still routes remote assets
 * through it: with the empty string, `${BRIDGE_HTTP_URL}/img?…` becomes
 * `/img?…`, which is wrong — every use must go through assetUrl()/pageUrl()
 * style helpers or the explicit API_BASE prefix. It stays '' so any
 * un-migrated `startsWith(BRIDGE_HTTP_URL)` check degrades to "starts with
 * /", which same-origin URLs do.
 */
export const BRIDGE_HTTP_URL = ''

/**
 * 'bridge' in this build means "a server is behind us" — the capabilities
 * probe still runs, /tts and /stt still exist, the brain is server-side.
 * It is not a choice any more (the Next app IS the bridge); the constant
 * survives so capability gating downstream reads the same as it always did.
 */
export type Backend = 'bridge' | 'direct'
export const BACKEND: Backend = 'bridge'

/** The browser's own speechSynthesis remains the instant, on-device floor. */
export const USE_ELEVENLABS = false
export const TTS_ENGINE: 'system' | 'kokoro' = 'system'
export const KOKORO_VOICE = 'bm_george'

/**
 * Client-side keys are gone on purpose. A Next.js page is a public bundle:
 * anything readable here is readable by whoever opens devtools. Every key —
 * Gemini, Deepgram, ElevenLabs, local servers — lives in .env.local on the
 * server, documented in SETUP.md.
 */
export const env = {
  anthropicKey: '',
  elevenKey: '',
  elevenVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
  porcupineKey: '',
}

/** The wake-word engine. 'speech' — the browser's own recogniser, zero keys. */
export const WAKE_ENGINE: 'speech' | 'porcupine' = 'speech'

/** MCP servers were a bridge-mode concept; the tools are server-side now. */
export type McpServer = {
  name: string
  label: string
  url: string
  token?: string
  enabled: boolean
}
export const MCP_SERVERS: McpServer[] = []
export const activeServers = () => MCP_SERVERS.filter((s) => s.enabled && s.url)
