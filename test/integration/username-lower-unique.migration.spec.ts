import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../../src/adapters/persistence/schema.js';
import { users } from '../../src/adapters/persistence/schema.js';

const MIGRATIONS = resolve(import.meta.dirname, '../../drizzle');
const LAST_BEFORE_INDEX = '0001_create_progress';
const ADA_ID = '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01';
const CAPITAL_ADA_ID = '0b9e7f4a-5c3d-4e2b-8a1f-9c8d7e6f5a40';

interface JournalEntry {
  readonly tag: string;
}

// Copies the drizzle/ migrations up to and including `lastTag` into a new
// temporary folder, with a journal that lists only those migrations.
async function migrationsThrough(lastTag: string): Promise<string> {
  const journal = JSON.parse(await readFile(join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as {
    entries: JournalEntry[];
  };
  const last = journal.entries.findIndex((entry) => entry.tag === lastTag);
  if (last < 0) {
    throw new Error(`unknown migration ${lastTag}`);
  }
  const entries = journal.entries.slice(0, last + 1);
  const folder = await mkdtemp(join(tmpdir(), 'hexablock-migrations-'));
  await mkdir(join(folder, 'meta'));
  await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) {
    await copyFile(join(MIGRATIONS, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
  }
  return folder;
}

// Migration 0002 adds the unique index on lower(username) of #62. It does not
// resolve names that already differ only in letter case. Which account keeps
// the name is a product decision, so the migration fails and changes nothing.
describe('migration 0002_username_lower_unique', () => {
  let client: PGlite;
  let db: PgliteDatabase<typeof schema>;
  let partialMigrations: string;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle({ client, schema });
    partialMigrations = await migrationsThrough(LAST_BEFORE_INDEX);
  });

  afterEach(async () => {
    await client.close();
    await rm(partialMigrations, { recursive: true, force: true });
  });

  it('should_fail_the_migration_and_keep_every_row_when_two_usernames_differ_only_in_case', async () => {
    await migrate(db, { migrationsFolder: partialMigrations });
    await db.insert(users).values([
      { id: ADA_ID, username: 'ada', passwordHash: 'scrypt$ada' },
      { id: CAPITAL_ADA_ID, username: 'Ada', passwordHash: 'scrypt$capital' },
    ]);

    const migrated = migrate(db, { migrationsFolder: MIGRATIONS });

    await expect(migrated).rejects.toMatchObject({
      cause: { code: '23505', constraint: 'users_username_lower_unique' },
    });
    expect(await db.select().from(users).orderBy(users.id)).toEqual([
      { id: CAPITAL_ADA_ID, username: 'Ada', passwordHash: 'scrypt$capital' },
      { id: ADA_ID, username: 'ada', passwordHash: 'scrypt$ada' },
    ]);
    const index = await db.execute(
      sql`select indexname from pg_indexes where indexname = 'users_username_lower_unique'`,
    );
    expect(index.rows).toEqual([]);
    const recorded = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
    );
    expect(recorded.rows).toEqual([{ count: 2 }]);
  });
});
