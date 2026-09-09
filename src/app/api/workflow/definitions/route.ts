import { NextResponse } from 'next/server';
import { InMemoryWorkflowStore } from '../../../../lib/server/workflow/store';

export async function GET() {
  try {
    const store = InMemoryWorkflowStore.getInstance();
    const definitions = await store.listDefinitions();
    return NextResponse.json(definitions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
