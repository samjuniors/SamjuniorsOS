import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { buildActivityProjection } from '@/lib/server/activity/projection';
import type { ActivityResponseDTO } from '@/types/activity';

export const dynamic = 'force-dynamic';

/**
 * PHASE 4.4C — AUTHORITATIVE ACTIVITY READ API.
 *
 * GET /api/activity?limit=<n>
 *
 * Returns the deterministic server-side Activity projection of authoritative
 * company events (work lifecycle, founder approvals, side-effect
 * authorizations, automation lifecycle). Activity is a READ PROJECTION — the
 * audit/run/approval/scheduler records remain the sources of truth.
 *
 * Security posture (founder directive 4.4C):
 *   - Founder-gated via the canonical session primitive, fail-closed 401 for
 *     unauthenticated or non-founder principals (same as /api/agents/runs).
 *   - Summaries only: no payloads, hashes, targets or authorization evidence
 *     are exposed here — provenance POINTERS reference the authorized
 *     inspector surfaces (/api/workflow/authorizations/audit et al).
 *   - Bounded response (limit clamped 1..200).
 *   - The projection itself fails closed: any authoritative store error
 *     propagates as 500 — records are never fabricated.
 */
export async function GET(req: NextRequest) {
  try {
    // Canonical founder gate — same primitive as the other protected
    // executive APIs.
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        {
          error:
            'Unauthorized: Valid Founder session required to read company Activity',
          success: false,
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawLimit = searchParams.get('limit');
    let limit: number | undefined;
    if (rawLimit !== null) {
      const parsed = parseInt(rawLimit, 10);
      // Fail-closed on non-numeric limits (never silently default).
      if (!Number.isFinite(parsed) || parsed < 1) {
        return NextResponse.json(
          {
            error: 'Invalid limit: must be a positive integer',
            success: false,
          },
          { status: 400 }
        );
      }
      limit = parsed;
    }

    const projection = await buildActivityProjection({ limit });

    const body: ActivityResponseDTO = {
      asOfTime: projection.asOfTime,
      totalProjected: projection.totalProjected,
      events: projection.events,
    };
    return NextResponse.json(body);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to project Activity';
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
