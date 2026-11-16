import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Logger } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../../src/adapters/persistence/schema.js';

const MIGRATIONS = resolve(import.meta.dirname, '../../drizzle');

export interface TestDatabase {
  readonly db: PgliteDatabase<typeof schema>;
  close(): Promise<void>;
}

// Starts Postgres in memory with PGlite and applies the drizzle/ migrations.
// drizzle-kit writes meta/_journal.json on its first run, so the
// helper skips the step while no migration exists. A test that must see
// each query and its parameters passes a logger.
export async function createTestDatabase(logger?: Logger): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle({ client, schema, logger });
  if (existsSync(resolve(MIGRATIONS, 'meta/_journal.json'))) {
    await migrate(db, { migrationsFolder: MIGRATIONS });
  }
  return { db, close: () => client.close() };
}
