import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { DrizzleLevelRepository } from '../../src/adapters/persistence/drizzle-level-repository.js';
import * as schema from '../../src/adapters/persistence/schema.js';
import { receiveValueOf } from '../../src/adapters/received.js';
import type { LevelChange } from '../../src/application/ports/level-repository.js';
import type { LevelDefinition } from '../../src/domain/level/level-definition.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { LevelId } from '../../src/domain/progress/level-id.js';
import { ok } from '../../src/domain/shared/result.js';
import { checkedLevel, levelJson, levelValidators } from '../support/level-format.js';
import { valueOf } from '../support/result.js';

// Concurrency tests of the advisory lock in DrizzleLevelRepository.update()
// (#80). They need a real Postgres server. PGlite runs one session, so it
// cannot show two sessions that wait for one lock.
//
// The suite runs only when HB_TEST_PG_URL holds a Postgres connection URL.
// Without it, the suite is skipped and opens no connection. Use a throwaway
// database, for example:
//
//   docker run --rm -d --name hb-pg-lock -e POSTGRES_PASSWORD=pw -p 55433:5432 postgres:16-alpine
//   HB_TEST_PG_URL=postgres://postgres:pw@127.0.0.1:55433/postgres \
//     pnpm vitest run test/integration/drizzle-level-repository.concurrency.spec.ts
//   docker stop hb-pg-lock
//
// The CI job postgres-lock runs the suite on a Postgres service and fails
// when the suite is skipped.
//
// The suite applies the drizzle/ migrations. Each test uses new levelId
// values and deletes its rows after the suite, so a second run on the same
// database passes.

const PG_URL = process.env.HB_TEST_PG_URL;
const MIGRATIONS = resolve(import.meta.dirname, '../../drizzle');
const SORT = valueOf(GameId.of('hexa-sort'));

describe.skipIf(!PG_URL)('DrizzleLevelRepository on a real Postgres', () => {
  let pool: pg.Pool;
  let db: NodePgDatabase<typeof schema>;
  const createdLevels: string[] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: PG_URL, max: 20 });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
  });

  afterAll(async () => {
    await pool.query(
      "delete from levels where game_id = 'hexa-sort' and level_id = any($1::text[])",
      [createdLevels],
    );
    await pool.end();
  });

  // A new Sort levelId, so each test owns its rows.
  function newLevelId(): string {
    const levelId = `lock-${randomUUID()}`;
    createdLevels.push(levelId);
    return levelId;
  }

  function repository(): DrizzleLevelRepository {
    return new DrizzleLevelRepository(db, levelValidators());
  }

  function versionOf(level: LevelDefinition): number {
    return receiveValueOf(receiveValueOf(level).version);
  }

  // A change that saves the next version of the level: 1 when no valid
  // level is stored, else the stored version plus 1. A lost update gives a
  // lower final version.
  function raise(levelId: string, seen: (number | null)[] = []): LevelChange {
    return (stored) => {
      const storedVersion = stored.state === 'valid' ? versionOf(stored.level) : null;
      seen.push(storedVersion);
      const version = storedVersion === null ? 1 : storedVersion + 1;
      return ok(checkedLevel(levelJson('hexa-sort', levelId, version)));
    };
  }

  async function storedVersion(levelId: string): Promise<string | undefined> {
    const result = await pool.query<{ version: string }>(
      "select version from levels where game_id = 'hexa-sort' and level_id = $1",
      [levelId],
    );
    return result.rows.map((row) => row.version).join(',') || undefined;
  }

  // Every stored row of the level, as text, to compare before and after.
  async function snapshot(levelId: string): Promise<string> {
    const result = await pool.query(
      "select * from levels where game_id = 'hexa-sort' and level_id = $1",
      [levelId],
    );
    return JSON.stringify(result.rows);
  }

  it('should_run_one_after_the_other_when_many_updates_of_one_level_overlap', async () => {
    const levelId = newLevelId();
    const seen: (number | null)[] = [];
    const count = 30;

    await Promise.all(
      Array.from({ length: count }, () =>
        repository().update(SORT, valueOf(LevelId.of(levelId)), raise(levelId, seen)),
      ),
    );

    // Each change read what the change before it saved.
    expect(seen).toEqual([null, ...Array.from({ length: count - 1 }, (_, i) => i + 1)]);
    expect(await storedVersion(levelId)).toBe(String(count));
  });

  // The version rule runs again inside each update(), so an update that
  // races a newer one cannot save an older level (S3-10).
  it.each([
    [3, 1, 2],
    [1, 2, 3],
    [2, 3, 1],
  ])(
    'should_keep_the_highest_version_when_updates_of_one_level_overlap_in_any_order',
    async (firstVersion, secondVersion, thirdVersion) => {
      const levelId = newLevelId();
      const updates = [firstVersion, secondVersion, thirdVersion].map((version) => {
        const incoming = checkedLevel(levelJson('hexa-sort', levelId, version));
        return repository().update(SORT, valueOf(LevelId.of(levelId)), (stored) =>
          stored.state === 'valid' ? stored.level.accepts(incoming) : ok(incoming),
        );
      });

      await Promise.all(updates);

      expect(await storedVersion(levelId)).toBe('3');
    },
  );

  it('should_wait_without_running_the_change_when_another_session_holds_the_lock', async () => {
    const levelId = newLevelId();
    const otherLevelId = newLevelId();
    let changes = 0;
    const counting: LevelChange = (stored) => {
      changes += 1;
      return raise(levelId)(stored);
    };
    const holder = await pool.connect();
    try {
      await holder.query('begin');
      // The same key as DrizzleLevelRepository.update(): "levels:<gameId>:<levelId>".
      await holder.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `levels:hexa-sort:${levelId}`,
      ]);
    } catch (error) {
      holder.release();
      throw error;
    }

    let settled = false;
    const pending = repository()
      .update(SORT, valueOf(LevelId.of(levelId)), counting)
      .then((outcome) => {
        settled = true;
        return outcome;
      });
    try {
      await sleep(700);

      expect(settled).toBe(false);
      expect(changes).toBe(0);
      // The lock of one level does not block another level.
      const other = await repository().update(
        SORT,
        valueOf(LevelId.of(otherLevelId)),
        raise(otherLevelId),
      );
      expect(other.ok).toBe(true);
    } finally {
      await holder.query('commit');
      holder.release();
    }

    const outcome = await pending;
    expect(outcome.ok).toBe(true);
    expect(changes).toBe(1);
    expect(await storedVersion(levelId)).toBe('1');
  });

  it('should_leave_the_row_unchanged_and_release_the_lock_when_an_update_fails', async () => {
    const levelId = newLevelId();
    await repository().update(SORT, valueOf(LevelId.of(levelId)), raise(levelId));
    const before = await snapshot(levelId);

    const thrown = repository().update(SORT, valueOf(LevelId.of(levelId)), () => {
      throw new Error('boom');
    });
    await expect(thrown).rejects.toThrow('boom');
    expect(await snapshot(levelId)).toBe(before);

    const older = checkedLevel(levelJson('hexa-sort', levelId, 1));
    const newer = await repository().update(SORT, valueOf(LevelId.of(levelId)), raise(levelId));
    const rejected = await repository().update(SORT, valueOf(LevelId.of(levelId)), (stored) =>
      stored.state === 'valid' ? stored.level.accepts(older) : ok(older),
    );
    expect(newer.ok).toBe(true);
    expect(rejected).toEqual({ ok: false, error: 'older-version' });
    expect(await storedVersion(levelId)).toBe('2');

    // Each failure released the lock, so the next update of the key completes.
    expect((await repository().update(SORT, valueOf(LevelId.of(levelId)), raise(levelId))).ok).toBe(
      true,
    );
    expect(await storedVersion(levelId)).toBe('3');
  });

  // Fifty changes of one level each read what the change before saved, so
  // no update is lost and the last one saves version 50.
  it('should_keep_every_update_when_fifty_updates_of_one_level_overlap', async () => {
    const levelId = newLevelId();
    await Promise.all(
      Array.from({ length: 50 }, () =>
        repository().update(SORT, valueOf(LevelId.of(levelId)), raise(levelId)),
      ),
    );
    expect(await storedVersion(levelId)).toBe('50');
  });

  // The levels: prefix keeps the lock key of a level apart from other keys
  // with the same text, so a lock on "<gameId>:<levelId>" does not block it.
  it('should_not_wait_when_the_same_text_without_the_levels_prefix_is_locked', async () => {
    const levelId = newLevelId();
    const holder = await pool.connect();
    await holder.query('begin');
    await holder.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `sort:${levelId}`,
    ]);
    try {
      expect(
        (await repository().update(SORT, valueOf(LevelId.of(levelId)), raise(levelId))).ok,
      ).toBe(true);
    } finally {
      await holder.query('commit');
      holder.release();
    }
  });
});
