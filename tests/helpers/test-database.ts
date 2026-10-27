import path from 'node:path';

function getTestRepositoryRoot(): string {
  const configuredRoot = process.env.SAMJUNIORS_TEST_REPO_ROOT;
  if (configuredRoot && path.resolve(process.cwd()) === path.resolve(configuredRoot)) {
    return path.resolve(configuredRoot);
  }
  return path.resolve(process.cwd());
}

/** Keep suite-owned SQLite files inside the runner's disposable database tree. */
export function getTestDatabaseDir(): string {
  const repositoryRoot = getTestRepositoryRoot();
  const configuredDirectory = process.env.SAMJUNIORS_TEST_DB_DIR;
  const isRunnerRepositoryCwd = path.resolve(process.cwd()) === repositoryRoot;
  return path.resolve(
    isRunnerRepositoryCwd && configuredDirectory
      ? configuredDirectory
      : path.join(repositoryRoot, 'prisma', 'db'),
  );
}

/** Prisma CLI resolves SQLite paths relative to prisma/schema.prisma. */
export function toSchemaRelativeSqliteUrl(databasePath: string): string {
  const schemaDirectory = path.join(getTestRepositoryRoot(), 'prisma');
  const relativePath = path.relative(schemaDirectory, path.resolve(databasePath));
  if (path.isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith(`..${path.sep}`)) {
    throw new Error('Test SQLite databases must be inside the Prisma schema directory.');
  }
  return `file:./${relativePath.replace(/\\/g, '/')}`;
}

/**
 * Runtime PrismaClient instances resolve relative SQLite paths from process.cwd(),
 * not from prisma/schema.prisma. This converts any file path or schema-relative
 * file URL into an absolute file URL safe for PrismaClient.
 */
export function toRuntimeSqliteUrl(databasePath: string): string {
  return `file:${path.resolve(databasePath).replace(/\\/g, '/')}`;
}

export function toPrismaClientUrl(databasePathOrUrl: string): string {
  if (databasePathOrUrl.startsWith('file:')) {
    const rawPath = databasePathOrUrl.slice('file:'.length);
    if (!path.isAbsolute(rawPath) && !path.win32.isAbsolute(rawPath)) {
      const schemaDirectory = path.join(getTestRepositoryRoot(), 'prisma');
      return `file:${path.resolve(schemaDirectory, rawPath).replace(/\\/g, '/')}`;
    }
    return databasePathOrUrl;
  }
  return `file:${path.resolve(databasePathOrUrl).replace(/\\/g, '/')}`;
}
