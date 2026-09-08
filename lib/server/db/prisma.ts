import { PrismaClient } from '@prisma/client';

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

/**
 * Checks if a live PostgreSQL database is connected and reachable.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes('dummy') || url.includes('placeholder')) {
    return false;
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures a live PostgreSQL connection is active, or throws if unavailable.
 * Used for authoritative operations that must fail closed rather than silently falling back.
 */
export async function requireDatabase(): Promise<PrismaClient> {
  const available = await isDatabaseAvailable();
  if (!available) {
    throw new Error(
      'PostgreSQL Database Unavailable: Authoritative operation aborted. Check DATABASE_URL and database connectivity.'
    );
  }
  return prisma;
}
