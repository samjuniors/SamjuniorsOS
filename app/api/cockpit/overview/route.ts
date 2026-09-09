import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { getCockpitOverview, CockpitReadError } from '@/lib/server/cockpit/overview';
import { DatabaseAuthorityError } from '@/lib/server/db/authority';

/**
 * PHASE 3.3 — AUTHORITATIVE COMMAND CENTER READS.
 *
 * GET /api/cockpit/overview
 *
 * A single, typed, READ-ONLY server-side aggregation for the Executive
 * Cockpit (Vitals Wall + Executive Stream). Every value is derived from the
 * existing persistence repositories through lib/server/cockpit/overview.ts;
 * this route adds no data source, no authorization logic (identity remains
 * exclusively with getAuthenticatedFounder), and no mutation.
 *
 * Failure semantics (fail-closed, per AGENTS.md):
 * - 401 — no verified founder session.
 * - 503 — an authoritative source is unavailable (e.g. PostgreSQL unreachable
 *   in authoritative mode). A database failure is NEVER presented as zeros.
 * - 500 — unexpected failure, surfaced with a safe message.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Session required' },
        { status: 401 }
      );
    }

    const overview = await getCockpitOverview();
    return NextResponse.json(overview);
  } catch (error: unknown) {
    if (error instanceof CockpitReadError) {
      const cause = error.cause;
      const dbUnavailable =
        cause instanceof DatabaseAuthorityError ||
        /DatabaseAuthority|unavailable/i.test(cause instanceof Error ? cause.message : '');
      const status = dbUnavailable ? 503 : 500;
      return NextResponse.json(
        {
          error: dbUnavailable
            ? 'Authoritative persistence is unavailable — Command Center reads are unavailable rather than fabricated.'
            : 'Command Center reads failed — no data was fabricated.',
          source: error.source,
          code: dbUnavailable ? 'reads_unavailable' : 'reads_failed',
        },
        { status }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Command Center overview failed: ${message}`, code: 'reads_failed' },
      { status: 500 }
    );
  }
}
