import { NextRequest, NextResponse } from 'next/server';
import { CommunicationRuntime } from '@/lib/server/communication/runtime';
import { AgentRole } from '@/types/os';
import { DraftStatus } from '@/types/communication';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';

/**
 * GET /api/communication/drafts
 * Lists communication drafts.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const authoringRole = (searchParams.get('authoringRole') as AgentRole) || undefined;
    const workflowInstanceId = searchParams.get('workflowInstanceId') || undefined;
    const status = (searchParams.get('status') as DraftStatus) || undefined;

    const runtime = CommunicationRuntime.getInstance();
    const drafts = await runtime.listDrafts({
      authoringRole,
      workflowInstanceId,
      status,
    });

    return NextResponse.json({
      success: true,
      count: drafts.length,
      drafts,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/communication/drafts
 * Creates a new draft (evaluated under internal_mutation governance).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const body = await req.json();
    const {
      conversationId,
      threadId,
      authoringRole,
      workflowRef,
      channel,
      intendedRecipients,
      cc,
      bcc,
      subject,
      bodyContent,
      bodyMimeType,
    } = body;

    if (!authoringRole || !channel || !intendedRecipients || !subject || !bodyContent) {
      return NextResponse.json(
        { success: false, error: 'authoringRole, channel, intendedRecipients, subject, and bodyContent are required.' },
        { status: 400 }
      );
    }

    const runtime = CommunicationRuntime.getInstance();
    const draft = await runtime.createDraft({
      conversationId,
      threadId,
      authoringRole,
      workflowRef,
      channel,
      intendedRecipients,
      cc,
      bcc,
      subject,
      bodyContent,
      bodyMimeType,
    });

    return NextResponse.json({ success: true, draft });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
}
