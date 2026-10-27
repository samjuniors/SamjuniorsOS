import { PrismaClient } from '@prisma/client'
import path from 'node:path';
import { resolveSqliteDatabaseUrl } from './server/db/database-url';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const repositoryRoot = process.env.SAMJUNIORS_TEST_REPO_ROOT || process.cwd();
    const schemaDirectory = path.join(repositoryRoot, 'prisma');
    const databaseUrl = resolveSqliteDatabaseUrl(process.env.DATABASE_URL, schemaDirectory);
    globalForPrisma.prisma = new PrismaClient({
      ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return globalForPrisma.prisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const val = (client as any)[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});

if (process.env.NODE_ENV !== 'production') {
  // Retain connection in dev hot reloading
  globalForPrisma.prisma = globalForPrisma.prisma;
}
