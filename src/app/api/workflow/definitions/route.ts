import { NextRequest, NextResponse } from 'next/server';
import { InMemoryWorkflowStore } from '../../../../lib/server/workflow/store';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';

export async function GET(req: NextRequest) {
  try {
    // Defense-in-depth founder gate on top of the /api/workflow middleware
    // gate — the workflow catalog is Founder-only operational data.
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Founder session required' },
        { status: 401 }
      );
    }

    const store = InMemoryWorkflowStore.getInstance();
    const definitions = await store.listDefinitions();
    return NextResponse.json(definitions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
