import { PrismaClient } from '@prisma/client';
import { db as sharedDb } from '@/lib/db';

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

/**
 * Shared PrismaClient for the SQLite-backed SamJuniorsOS deployment.
 * Reuses the project-wide singleton exported from @/lib/db so that the OS
 * runtime and any other application surfaces share one connection to the
 * single SQLite database file.
 */
export const prisma: PrismaClient = globalThis.prismaGlobal ?? sharedDb;

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

/**
 * Checks if the SQLite database is connected and reachable.
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
 * Ensures a live database connection is active, or throws if unavailable.
 * Used for authoritative operations that must fail closed rather than
 * silently falling back.
 */
export async function requireDatabase(): Promise<PrismaClient> {
  const available = await isDatabaseAvailable();
  if (!available) {
    throw new Error(
      'Database Unavailable: Authoritative operation aborted. Check DATABASE_URL and database connectivity.'
    );
  }
  return prisma;
}
