import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { getDatabaseMode } from '@/lib/server/db/authority';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DB_TIMEOUT_MS = 2000;

export async function GET() {
  const start = Date.now();

  try {
    const dbPromise = prisma.$queryRaw`SELECT 1`;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Database health check timed out after ${DB_TIMEOUT_MS}ms`)), DB_TIMEOUT_MS)
    );

    await Promise.race([dbPromise, timeoutPromise]);
    const latencyMs = Date.now() - start;

    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          status: 'connected',
          latencyMs,
          mode: getDatabaseMode(),
        },
        version: process.env.npm_package_version || '0.2.1',
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          status: 'disconnected',
          error: error?.message || 'Unknown database connection error',
          mode: getDatabaseMode(),
        },
      },
      { status: 503 }
    );
  }
}
