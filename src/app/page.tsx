import SamjuniorsOS from '../os/App';

/**
 * The root route serves the ONE canonical SamJuniorsOS application
 * (relocated from Uploaded/Design1/src to src/os in Phase 4.3C-B.3).
 * Historical UI generations live in /old as inert reference material and
 * are never imported from an active route.
 *
 * Phase 5 (parity-gated retirement, see docs/audit/PHASE5-PARITY-CHECKLIST.md):
 * the legacy SOFIA voice tab is retired from the default experience and is
 * re-enabled at runtime with SAMJUNIORS_VOICE_LEGACY=1. The flag is read
 * server-side per request (force-dynamic) so it stays a runtime decision,
 * not a build-time constant.
 */
export const dynamic = 'force-dynamic';

export default function SamJuniorsOSPage() {
  return (
    <SamjuniorsOS legacyVoicePath={process.env.SAMJUNIORS_VOICE_LEGACY === '1'} />
  );
}
