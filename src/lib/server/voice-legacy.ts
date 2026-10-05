/**
 * ============================================================================
 * LEGACY VOICE PATH FLAG (PHASE 5 — parity-gated retirement)
 * ============================================================================
 * Phase 5 validated the SofiaUI-derived voice path (VoicePresence widget +
 * voiceRuntime/voicePlayback on the live-companion transport) against the
 * agreed voice-experience requirements. Everything verifiable in this
 * environment passed (see docs/audit/PHASE5-PARITY-CHECKLIST.md); the two
 * physically-unverifiable residues — real microphone speech → live streaming
 * transcription, and audible speaker output — require a supported machine
 * with hardware and provider keys, which this sandbox does not have.
 *
 * Per the phase brief ("if parity cannot be demonstrated, retain the old path
 * or a reversible feature flag"), the old voice path — the SOFIA tab
 * (src/sofia/**) and the routes only it consumes — is therefore RETIRED
 * FROM THE DEFAULT EXPERIENCE BEHIND THIS REVERSIBLE FLAG rather than
 * deleted outright:
 *
 *   SAMJUNIORS_VOICE_LEGACY=1   → the SOFIA tab and its exclusive routes
 *                                 behave exactly as before (full old path).
 *   unset / any other value      → the new voice path is the only voice
 *                                 surface; the legacy routes answer 410.
 *
 * The guard is checked AFTER authentication on founder-gated routes (auth
 * still fails closed first — removal must never weaken an existing control),
 * and the page shell reads the flag server-side (see src/app/page.tsx).
 *
 * Once live-audio verification on a real supported environment closes the
 * residue, the full removal set documented in the Phase 5 checklist can be
 * executed and this flag deleted.
 */

export const SAMJUNIORS_VOICE_LEGACY_ENV = 'SAMJUNIORS_VOICE_LEGACY';

/** True only when the legacy SOFIA voice path is explicitly re-enabled. */
export function legacyVoicePathEnabled(): boolean {
  return process.env[SAMJUNIORS_VOICE_LEGACY_ENV] === '1';
}

/** The 410 response served by legacy-only routes when the flag is off. */
export function legacyVoicePathDisabledResponse(): Response {
  return new Response(
    'Legacy SOFIA voice path retired (Phase 5). Re-enable with SAMJUNIORS_VOICE_LEGACY=1.',
    { status: 410 }
  );
}
