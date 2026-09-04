import { NextResponse } from 'next/server';
import { InMemoryWorkflowStore } from '../../../../lib/server/workflow/store';

export async function GET() {
  try {
    const store = InMemoryWorkflowStore.getInstance();
    const instances = await store.listInstances();
    return NextResponse.json(instances);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
