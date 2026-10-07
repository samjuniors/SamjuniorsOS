import SamJuniorsOS from '../os/App';

/**
 * The root route serves the ONE canonical SamJuniorsOS application.
 * The Sophia tab carries the SofiaUI surface port (src/sofia): the
 * full-screen particle Sophia with her own chat, voice UI and boot
 * entry, wired to the canonical live-voice flow. The old flag-gated
 * legacy SOFIA tab (SAMJUNIORS_VOICE_LEGACY) was fully retired when the
 * SofiaUI surface replaced it; the env flag now only governs the legacy
 * SERVER routes (src/lib/server/voice-legacy.ts), never this UI.
 */
export default function SamJuniorsOSPage() {
  return <SamJuniorsOS />;
}
