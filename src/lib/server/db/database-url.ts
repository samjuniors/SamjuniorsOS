import path from 'node:path';

/**
 * Resolve relative SQLite URLs from the Prisma schema directory before they
 * reach Prisma Client. This keeps runtime resolution aligned with the Prisma
 * CLI, which resolves SQLite paths relative to schema.prisma.
 */
export function resolveSqliteDatabaseUrl(
  databaseUrl: string | undefined,
  baseDirectory: string = path.join(process.cwd(), 'prisma'),
): string | undefined {
  if (!databaseUrl || !/^file:/i.test(databaseUrl)) return databaseUrl;

  const value = databaseUrl.slice(databaseUrl.indexOf(':') + 1);
  const suffixIndex = value.search(/[?#]/);
  const databasePath = suffixIndex === -1 ? value : value.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : value.slice(suffixIndex);

  if (!databasePath) return databaseUrl;

  // Keep POSIX, drive-letter, and UNC absolute paths exactly as supplied.
  if (path.isAbsolute(databasePath) || path.win32.isAbsolute(databasePath)) {
    return databaseUrl;
  }

  const absolutePath = path.resolve(baseDirectory, databasePath);
  return `file:${absolutePath.replace(/\\/g, '/')}${suffix}`;
}
