import { NextRequest, NextResponse } from "next/server";
import { ConnectorRegistry } from "@/lib/server/integrations/connector-registry";
import { getAuthenticatedFounder } from "@/lib/server/auth/session";

/**
 * PHASE 13: HONEST CONNECTOR STATUS API (FounderOS Pattern)
 * 
 * Truthful endpoint reporting connection health and environment status
 * without fake simulations or false positives.
 */
export async function GET(req: NextRequest) {
  try {
    // Fail closed: connector health discloses which external systems and
    // env keys this deployment is wired to — Founder-only.
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Founder session required', success: false },
        { status: 401 }
      );
    }

    const registry = ConnectorRegistry.getInstance();
    const connectors = registry.getConnectorStates();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      connectors,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to query connector registry" },
      { status: 500 }
    );
  }
}
