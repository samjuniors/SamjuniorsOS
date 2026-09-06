import { NextRequest, NextResponse } from 'next/server';
import { CommunicationRuntime } from '@/lib/server/communication/runtime';
import { InMemoryCommunicationStore } from '@/lib/server/communication/store';
import { CommunicationChannel, CommunicationIntentType } from '@/types/communication';

/**
 * GET /api/communication/intents
 * Lists recorded communication intents.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeRole = searchParams.get('employeeRole') || undefined;
    const type = (searchParams.get('type') as CommunicationIntentType) || undefined;
    const channel = (searchParams.get('channel') as CommunicationChannel) || undefined;
    const workflowInstanceId = searchParams.get('workflowInstanceId') || undefined;

    const store = InMemoryCommunicationStore.getInstance();
    const intents = await store.listIntents({
      employeeRole,
      type,
      channel,
      workflowInstanceId,
    });

    return NextResponse.json({
      success: true,
      count: intents.length,
      intents,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/communication/intents
 * Executes a communication intent through the centralized authorization gate.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, employeeRole, skillId, channel, payload, target, workflowRef, approvalId } = body;

    if (!type || !employeeRole || !channel || !payload) {
      return NextResponse.json(
        { success: false, error: 'type, employeeRole, channel, and payload are required.' },
        { status: 400 }
      );
    }

    const runtime = CommunicationRuntime.getInstance();
    const result = await runtime.executeIntent({
      type,
      employeeRole,
      skillId,
      channel,
      payload,
      target,
      workflowRef,
      approvalId,
    });

    return NextResponse.json({ success: result.allowed, result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
