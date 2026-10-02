import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { LiveTicketStore } from '@/lib/server/live/ticket-store';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/ws-ticket
 * Issues an ephemeral single-use ticket for authenticating to the live interaction WebSocket.
 * Strictly gated behind server-verified Founder authentication.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedFounder(req);

    if (!session || session.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Forbidden: Live interaction requires verified Founder authority' },
        { status: 403 }
      );
    }

    let conversationId: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.conversationId === 'string') {
        conversationId = body.conversationId.trim();
      }
    } catch {
      // Body is optional
    }

    const ticketStore = LiveTicketStore.getInstance();
    const ticket = ticketStore.issueTicket(session, conversationId);
    const wsPort = parseInt(process.env.LIVE_WS_PORT || '3001', 10);

    return NextResponse.json({
      success: true,
      ticket,
      expiresInSeconds: 60,
      wsPort,
    });
  } catch (err: any) {
    console.error('[WsTicketRoute] Error generating ticket:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error generating WebSocket ticket' },
      { status: 500 }
    );
  }
}
