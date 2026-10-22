import { NextRequest, NextResponse } from 'next/server';
import { getSofiaGreeting } from '@/lib/server/sophia/greeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const greeting = await getSofiaGreeting();
  return NextResponse.json(greeting);
}
