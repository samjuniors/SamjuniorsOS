import { NextRequest, NextResponse } from "next/server";
import { ConnectorRegistry } from "@/lib/server/integrations/connector-registry";

/**
 * PHASE 13: HONEST CONNECTOR STATUS API (FounderOS Pattern)
 * 
 * Truthful endpoint reporting connection health and environment status
 * without fake simulations or false positives.
 */
export async function GET(_req: NextRequest) {
  try {
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
