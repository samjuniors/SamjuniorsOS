/**
 * API Route: /api/conversation
 *
 * Founder-governed conversation management and physical deletion endpoint.
 *
 * SECURITY & GOVERNANCE INVARIANTS:
 * 1. Strict Founder Authentication: Every request must authenticate as FOUNDER via session.
 * 2. Zero Information Leakage: Inaccessible or non-existent conversations unconditionally
 *    return 404 Not Found (never 403) to prevent enumeration of other founders' records.
 * 3. Idempotent Deletion: Repeated deletion requests return 200 with alreadyDeleted: true.
 * 4. Write-Ahead Tombstone: Physical deletion writes an anti-resurrection tombstone before
 *    purging collection files and reconciling the Prisma mirror.
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
 * GET /api/conversation
 *
 * Query params:
 *  - id / conversationId: (optional) Retrieve specific conversation and its messages
 *  - limit: (optional) Max messages/conversations to return (default 20, max 100)
 */
export async function GET(req: NextRequest) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Valid Founder session required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('id') || searchParams.get('conversationId');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20;

    const convStore = ConversationStore.getInstance();

    if (conversationId && conversationId.trim().length > 0) {
      try {
        const conversation = await convStore.getConversation(founder.userId, conversationId.trim());
        if (!conversation) {
          return NextResponse.json(
            { success: false, error: 'Conversation not found' },
            { status: 404 }
          );
        }
        const messages = await convStore.getMessages(conversation.id, founder.userId, limit);
        return NextResponse.json({
          success: true,
          conversation,
          messages,
        });
      } catch (err: any) {
        if (
          err instanceof ConversationSecurityError ||
          err instanceof ConversationNotFoundError ||
          err.name === 'ConversationSecurityError' ||
          err.name === 'ConversationNotFoundError'
        ) {
          // Zero Information Leakage: Never reveal whether another founder owns the record
          return NextResponse.json(
            { success: false, error: 'Conversation not found' },
            { status: 404 }
          );
        }
        return NextResponse.json(
          { success: false, error: err.message || 'Failed to retrieve conversation' },
          { status: 500 }
        );
      }
    }

    // List recent conversations for the authenticated Founder
    const conversations = await convStore.listConversations(founder.userId, limit);
    return NextResponse.json({
      success: true,
      conversations,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retrieve conversations' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/conversation
 *
 * Query params or JSON body:
 *  - id / conversationId: ID of conversation to delete
 *  - messageId: (optional) If specified, deletes only the individual message
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
    let conversationId = searchParams.get('id') || searchParams.get('conversationId');
    let messageId = searchParams.get('messageId');

    if (!conversationId) {
      try {
        const body = await req.json();
        conversationId = conversationId || body.id || body.conversationId;
        messageId = messageId || body.messageId;
      } catch {
        // No or non-JSON body provided
      }
    }

    if (!conversationId || !conversationId.trim()) {
      return NextResponse.json(
        { success: false, error: 'Conversation ID is required' },
        { status: 400 }
      );
    }

    const convStore = ConversationStore.getInstance();

    // If messageId is provided, delegate to single message deletion
    if (messageId && messageId.trim()) {
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
    }

    // Delete entire conversation and cascade to messages
    try {
      const result = await convStore.deleteConversation(founder.userId, conversationId.trim());

      if (result.notFound) {
        return NextResponse.json(
          { success: false, error: 'Conversation not found' },
          { status: 404 }
        );
      }

      if (result.alreadyDeleted) {
        return NextResponse.json({
          success: true,
          deleted: false,
          alreadyDeleted: true,
          conversationId: result.conversationId,
          purgedMessageCount: result.purgedMessageCount,
        });
      }

      return NextResponse.json({
        success: true,
        deleted: true,
        conversationId: result.conversationId,
        purgedMessageCount: result.purgedMessageCount,
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
          { success: false, error: 'Conversation not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, error: err.message || 'Failed to delete conversation' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process deletion request' },
      { status: 500 }
    );
  }
}
