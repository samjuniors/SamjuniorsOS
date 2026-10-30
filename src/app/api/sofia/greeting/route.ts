import { NextRequest, NextResponse } from 'next/server';
import { getSofiaGreeting } from '@/lib/server/sophia/greeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const clientTime = url.searchParams.get('clientTime') || undefined;
  const lastSessionAt = url.searchParams.get('lastSessionAt') || undefined;
  const founderId = url.searchParams.get('founderId') || undefined;
  const clientHourParam = url.searchParams.get('clientHour');
  const clientHour = clientHourParam !== null ? parseInt(clientHourParam, 10) : undefined;

  const greeting = await getSofiaGreeting({
    clientTime,
    lastSessionAt,
    founderId,
    clientHour: !isNaN(clientHour as number) ? clientHour : undefined,
  });
  return NextResponse.json(greeting);
}
