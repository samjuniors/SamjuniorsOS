/**
 * API Route: /api/conversation/message
 *
 * Founder-governed individual message physical deletion endpoint.
 *
 * SECURITY & GOVERNANCE INVARIANTS:
 * 1. Strict Founder Authentication: Every request must authenticate as FOUNDER via session.
 * 2. Zero Information Leakage: Inaccessible or non-existent messages unconditionally
 *    return 404 Not Found (never 403) to prevent enumeration of other founders' records.
 * 3. Parent Timestamp Updating: Successful deletion updates parent conversation updatedAt.
 * 4. Dual-Store Cascade: Deletes from DurableFileStore and best-effort Prisma mirror.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import {
  ConversationStore,
  ConversationSecurityError,
  ConversationNotFoundError,
} from '@/lib/server/conversation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/conversation/message
 *
 * Query params or JSON body:
 *  - conversationId: ID of the parent conversation
 *  - messageId: ID of the message to delete
 */
export async function DELETE(req: NextRequest) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Valid Founder session required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    let conversationId = searchParams.get('conversationId') || searchParams.get('id');
    let messageId = searchParams.get('messageId');

    if (!conversationId || !messageId) {
      try {
        const body = await req.json();
        conversationId = conversationId || body.conversationId || body.id;
        messageId = messageId || body.messageId;
      } catch {
        // No or non-JSON body provided
      }
    }

    if (!conversationId || !conversationId.trim() || !messageId || !messageId.trim()) {
      return NextResponse.json(
        { success: false, error: 'Both conversationId and messageId are required' },
        { status: 400 }
      );
    }

    const convStore = ConversationStore.getInstance();

    try {
      const result = await convStore.deleteMessage(
        founder.userId,
        conversationId.trim(),
        messageId.trim()
      );

      if (result.notFound) {
        return NextResponse.json(
          { success: false, error: 'Message not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        deleted: true,
        conversationId: result.conversationId,
        messageId: result.messageId,
      });
    } catch (err: any) {
      if (
        err instanceof ConversationSecurityError ||
        err instanceof ConversationNotFoundError ||
        err.name === 'ConversationSecurityError' ||
        err.name === 'ConversationNotFoundError'
      ) {
        // Zero Information Leakage: Mismatched ownership fails closed with 404
        return NextResponse.json(
          { success: false, error: 'Message not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, error: err.message || 'Failed to delete message' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process message deletion request' },
      { status: 500 }
    );
  }
}
