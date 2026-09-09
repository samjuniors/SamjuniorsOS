import { PrismaClient } from '@prisma/client';
import { prisma, isDatabaseAvailable } from './prisma';

export type DatabaseMode = 'authoritative' | 'test' | 'local';

export class DatabaseAuthorityError extends Error {
  public readonly code = 'DATABASE_AUTHORITY_VIOLATION';
  public readonly statusCode = 503;

  constructor(message: string, public readonly originalError?: any) {
    super(`[DatabaseAuthority] FAIL-CLOSED: ${message}`);
    this.name = 'DatabaseAuthorityError';
  }
}

/**
 * Returns the current database authority mode.
 * 
 * Rules:
 * 1. Explicit DATABASE_MODE environment variable takes top precedence ('authoritative' | 'test' | 'local').
 * 2. In NODE_ENV === 'production', DATABASE_MODE defaults strictly to 'authoritative'.
 * 3. In NODE_ENV === 'test', DATABASE_MODE defaults to 'test'.
 * 4. Otherwise, defaults to 'local'.
 */
export function getDatabaseMode(): DatabaseMode {
  const envMode = process.env.DATABASE_MODE?.toLowerCase();
  if (envMode === 'authoritative' || envMode === 'test' || envMode === 'local') {
    return envMode;
  }

  if (process.env.NODE_ENV === 'production') {
    return 'authoritative';
  }

  if (process.env.NODE_ENV === 'test') {
    return 'test';
  }

  return 'local';
}

/**
 * Indicates whether the system is operating under authoritative database rules.
 * In authoritative mode, PostgreSQL is the single source of truth. Silent fallback is prohibited.
 */
export function isAuthoritativeMode(): boolean {
  return getDatabaseMode() === 'authoritative';
}

/**
 * Ensures PostgreSQL is reachable when in authoritative mode.
 * Throws DatabaseAuthorityError if PostgreSQL is unavailable in authoritative mode.
 * In test or local mode, returns prisma if available, or null if offline.
 */
export async function requireAuthoritativeDatabase(): Promise<PrismaClient> {
  const mode = getDatabaseMode();

  if (mode === 'authoritative') {
    const available = await isDatabaseAvailable();
    if (!available) {
      throw new DatabaseAuthorityError(
        'Authoritative database is required but PostgreSQL is unavailable. Cannot proceed without authoritative persistence.'
      );
    }
    return prisma;
  }

  return prisma;
}
