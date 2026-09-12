import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { getGraphOverview, GraphReadError } from '@/lib/server/graph/read-model';
import { DatabaseAuthorityError } from '@/lib/server/db/authority';

/**
 * ============================================================================
 * SAMJUNIORS OS — AUTHORITATIVE GRAPH READ API (PHASE 4.3A)
 * ============================================================================
 *
 * GET /api/graph
 *
 * Dedicated typed READ-ONLY server endpoint for the SamJuniorsOS living
 * operating graph projection. Derives the Meaningful Company Topology from
 * existing durable repositories (AgentRunStore, SideEffectAuthorizationGate,
 * WorkflowStore, EpistemicClaimStore).
 *
 * Failure Semantics (fail-closed, per AGENTS.md):
 * - 401: Unauthorized — missing or unverified founder session.
 * - 503: Service Unavailable — an authoritative source is unreachable
 *   (e.g., PostgreSQL is unavailable in authoritative mode). Database failures
 *   are NEVER masked as empty graphs or fabricated nodes.
 * - 500: Internal error surfaced safely without secret exposure.
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

    const graph = await getGraphOverview();
    return NextResponse.json(graph);
  } catch (error: unknown) {
    if (error instanceof GraphReadError) {
      const cause = error.cause;
      const dbUnavailable =
        cause instanceof DatabaseAuthorityError ||
        /DatabaseAuthority|unavailable/i.test(
          cause instanceof Error ? cause.message : ''
        );
      const status = dbUnavailable ? 503 : 500;
      return NextResponse.json(
        {
          error: dbUnavailable
            ? 'Authoritative persistence is unavailable — Graph reads are unavailable rather than fabricated.'
            : 'Authoritative graph read failed — no data was fabricated.',
          source: error.source,
          code: dbUnavailable ? 'reads_unavailable' : 'reads_failed',
        },
        { status }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Graph overview failed: ${message}`, code: 'reads_failed' },
      { status: 500 }
    );
  }
}
