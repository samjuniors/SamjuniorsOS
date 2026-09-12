import { NextRequest, NextResponse } from 'next/server';
import { SERVER_AGENTS } from '@/lib/server/agents/definitions';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';

/**
 * GET /api/agents
 * Authoritative workforce roster read model (Phase 3.4 runtime wiring).
 *
 * Single server-side source of truth for which AI employees exist and how
 * they are identified, so the UI does not need to duplicate the backend
 * domain model. Serves the closed four-role union from
 * lib/server/agents/definitions.ts (COO/Sophia, Researcher/Thorne,
 * PM/Maya, Finance/Julian). Presentation-layer styling stays client-side.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Session required to read the workforce roster' },
        { status: 401 }
      );
    }

    const agents = Object.values(SERVER_AGENTS).map((def) => ({
      id: def.id,
      name: def.name,
      role: def.role,
      department: def.department,
      responsibilities: def.responsibilities,
      skills: def.skills,
      capabilities: def.allowedCapabilities,
      protocolResponsibilities: def.protocolResponsibilities,
    }));

    return NextResponse.json({
      success: true,
      count: agents.length,
      source: 'lib/server/agents/definitions.ts',
      agents,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to read workforce roster' },
      { status: 500 }
    );
  }
}
