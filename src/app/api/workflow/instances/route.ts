import { NextRequest, NextResponse } from 'next/server';
import { InMemoryWorkflowStore } from '../../../../lib/server/workflow/store';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const store = InMemoryWorkflowStore.getInstance();
    const instances = await store.listInstances();
    return NextResponse.json(instances);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
