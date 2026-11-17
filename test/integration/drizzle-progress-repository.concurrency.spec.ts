import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { DrizzleProgressRepository } from '../../src/adapters/persistence/drizzle-progress-repository.js';
import * as schema from '../../src/adapters/persistence/schema.js';
import type { Clock } from '../../src/application/ports/clock.js';
import {
  SyncProgressUseCase,
  type SyncProgressRequest,
} from '../../src/application/progress/sync-progress.use-case.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { Score } from '../../src/domain/progress/score.js';
import type { SyncInstant } from '../../src/domain/progress/sync-instant.js';
import { UserId } from '../../src/domain/user/user-id.js';
import { FixedClock } from '../support/fixed-clock.js';
import { heldLevels } from '../support/held-levels.js';
import { levelResultOf } from '../support/level-results.js';
import { valueOf } from '../support/result.js';
import { syncInstantOf } from '../support/sync-instants.js';

// Concurrency tests of the advisory lock in DrizzleProgressRepository.update()
// (DEF-01, DEF-02). They need a real Postgres server. PGlite runs one
// session, so it cannot show two sessions that wait for one lock.
//
// The suite runs only when HB_TEST_PG_URL holds a Postgres connection URL.
// Without it, the suite is skipped and opens no connection. Use a throwaway
// database, for example:
//
//   docker run --rm -d --name hb-pg-lock -e POSTGRES_PASSWORD=pw -p 55433:5432 postgres:16-alpine
//   HB_TEST_PG_URL=postgres://postgres:pw@127.0.0.1:55433/postgres \
//     pnpm vitest run test/integration/drizzle-progress-repository.concurrency.spec.ts
//   docker stop hb-pg-lock
//
// The CI job postgres-lock runs the suite on a Postgres service and fails
// when the suite is skipped.
//
// The suite applies the drizzle/ migrations. Each test uses new user ids and
// deletes its rows after the suite, so a second run on the same database
// passes.

const PG_URL = process.env.HB_TEST_PG_URL;
const MIGRATIONS = resolve(import.meta.dirname, '../../drizzle');
const START = new Date('2026-11-06T10:00:00.000Z');

describe.skipIf(!PG_URL)('DrizzleProgressRepository on a real Postgres', () => {
  let pool: pg.Pool;
  let db: NodePgDatabase<typeof schema>;
  const createdUsers: string[] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: PG_URL, max: 20 });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
  });

  afterAll(async () => {
    // level_results rows go with their progress row (on delete cascade).
    await pool.query('delete from progress where user_id = any($1::uuid[])', [createdUsers]);
    await pool.query('delete from users where id = any($1::uuid[])', [createdUsers]);
    await pool.end();
  });

  // Inserts a new user, so the progress foreign key to users.id holds.
  async function newPlayer(): Promise<string> {
    const id = randomUUID();
    createdUsers.push(id);
    // randomUUID() gives lower case, so the name is its own key (#73).
    await pool.query(
      'insert into users (id, username, username_key, password_hash) values ($1, $2, $2, $3)',
      [id, `lock-${id}`, 'scrypt$hash'],
    );
    return id;
  }

  // Each reading is 1 ms after the previous one. The order of the readings
  // shows the order in which the syncs ran under the lock.
  function tickingClock(): Clock {
    const clock = new FixedClock(syncInstantOf(START));
    return {
      now: () => {
        const reading = clock.now();
        clock.advanceBy(1);
        return reading;
      },
    };
  }

  // The levels of the requests of this suite: l0 to l29 of fit and lines,
  // so each result has a level (#135).
  const LEVEL_IDS = Array.from({ length: 30 }, (_, n) => `l${n}`);
  const LEVELS = heldLevels([
    ['fit', LEVEL_IDS],
    ['lines', LEVEL_IDS],
  ]);

  function syncWith(clock: Clock = tickingClock()): SyncProgressUseCase {
    return new SyncProgressUseCase(new DrizzleProgressRepository(db), LEVELS, clock);
  }

  function syncRequest(
    userId: string,
    score: number | undefined,
    levels: number[],
    gameId = 'fit',
  ): SyncProgressRequest {
    return {
      userId: valueOf(UserId.from(userId)),
      gameId: valueOf(GameId.of(gameId)),
      ...(score === undefined ? {} : { score: valueOf(Score.of(score)) }),
      results: levels.map((n) =>
        levelResultOf({ levelId: `l${n}`, stars: 1, moves: n, elapsedMs: n }),
      ),
    };
  }

  async function levelIds(userId: string): Promise<string[]> {
    const result = await pool.query<{ level_id: string }>(
      'select level_id from level_results where user_id = $1 order by level_id',
      [userId],
    );
    return result.rows.map((row) => row.level_id);
  }

  async function progressRows(userId: string) {
    const result = await pool.query<{ game_id: string; high_score: string; updated_at: Date }>(
      'select game_id, high_score, updated_at from progress where user_id = $1 order by game_id',
      [userId],
    );
    return result.rows;
  }

  // Every stored row of the user, as text, to compare before and after.
  async function snapshot(userId: string): Promise<string> {
    const progressResult = await pool.query(
      'select * from progress where user_id = $1 order by game_id',
      [userId],
    );
    const levelsResult = await pool.query(
      'select * from level_results where user_id = $1 order by game_id, level_id',
      [userId],
    );
    return JSON.stringify([progressResult.rows, levelsResult.rows]);
  }

  it('should_keep_every_level_highest_score_and_last_instant_when_many_syncs_of_one_game_overlap', async () => {
    const player = await newPlayer();
    const sync = syncWith();
    const count = 30;

    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        sync.execute(syncRequest(player, i === 7 ? 500 : 100, [i])),
      ),
    );

    const rows = await progressRows(player);
    expect(await levelIds(player)).toHaveLength(count);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.high_score)).toBe(500);
    // The last sync under the lock read the last instant.
    expect(rows[0]?.updated_at.toISOString()).toBe(
      new Date(START.getTime() + count - 1).toISOString(),
    );
  });

  it.each([
    [500, 100],
    [100, 500],
  ])(
    'should_keep_highest_score_when_syncs_of_500_and_100_overlap_in_either_order',
    async (firstScore, secondScore) => {
      const player = await newPlayer();
      const sync = syncWith();

      await Promise.all(
        [firstScore, secondScore].map((score) => sync.execute(syncRequest(player, score, []))),
      );

      const rows = await progressRows(player);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0]?.high_score)).toBe(500);
    },
  );

  it('should_store_both_games_when_syncs_of_two_games_overlap', async () => {
    const player = await newPlayer();
    const sync = syncWith();

    await Promise.all([
      sync.execute(syncRequest(player, 5, [1], 'fit')),
      sync.execute(syncRequest(player, 6, [1], 'lines')),
    ]);

    expect((await progressRows(player)).map((row) => row.game_id)).toEqual(['fit', 'lines']);
  });

  it('should_wait_without_reading_the_clock_when_another_session_holds_the_lock', async () => {
    const player = await newPlayer();
    let clockReadings = 0;
    const ticking = tickingClock();
    const countingClock: Clock = {
      now: () => {
        clockReadings += 1;
        return ticking.now();
      },
    };
    const holder = await pool.connect();
    try {
      await holder.query('begin');
      // The same key as DrizzleProgressRepository.update(): "<userId>:<gameId>".
      await holder.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${player}:fit`,
      ]);
    } catch (error) {
      holder.release();
      throw error;
    }

    let settled = false;
    const pending = syncWith(countingClock)
      .execute(syncRequest(player, 9, [1]))
      .then((outcome) => {
        settled = true;
        return outcome;
      });
    try {
      await sleep(700);

      expect(settled).toBe(false);
      expect(clockReadings).toBe(0);
      // The lock of one game does not block another game.
      expect((await syncWith().execute(syncRequest(player, 1, [], 'lines'))).ok).toBe(true);
    } finally {
      await holder.query('commit');
      holder.release();
    }

    const outcome = await pending;
    expect(outcome.ok).toBe(true);
    expect(clockReadings).toBe(1);
  });

  it('should_keep_every_level_and_highest_score_when_three_syncs_overlap_in_repeated_rounds', async () => {
    for (let round = 0; round < 15; round++) {
      const player = await newPlayer();
      const sync = syncWith();

      await Promise.all([
        sync.execute(syncRequest(player, 300, [1, 2])),
        sync.execute(syncRequest(player, 200, [3])),
        sync.execute(syncRequest(player, 250, [4, 5])),
      ]);

      expect(await levelIds(player)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
      expect(Number((await progressRows(player))[0]?.high_score)).toBe(300);
    }
  });

  it('should_leave_rows_unchanged_and_release_the_lock_when_a_sync_fails', async () => {
    const player = await newPlayer();
    await syncWith().execute(syncRequest(player, 50, [1, 2]));
    const before = await snapshot(player);

    // The types forbid a Clock that gives no SyncInstant. The guard of the
    // aggregate throws under the lock (#97).
    const invalidClock = syncWith({ now: () => new Date(Number.NaN) as unknown as SyncInstant });
    await expect(invalidClock.execute(syncRequest(player, 999, [9]))).rejects.toThrow(
      new TypeError('The instant must be a SyncInstant.'),
    );
    expect(await snapshot(player)).toBe(before);

    const throwingClock = syncWith({
      now: () => {
        throw new Error('boom');
      },
    });
    await expect(throwingClock.execute(syncRequest(player, 999, [9]))).rejects.toThrow('boom');
    expect(await snapshot(player)).toBe(before);

    // The request types forbid this score. The guard of the aggregate throws
    // under the lock: a defect of the caller is not a failed Result (#103).
    await expect(
      syncWith().execute({
        ...syncRequest(player, undefined, [9]),
        score: 999 as unknown as Score,
      }),
    ).rejects.toThrow(new TypeError('A high score must be a Score.'));
    expect(await snapshot(player)).toBe(before);

    // The foreign key to users.id rejects a user that does not exist.
    // Postgres code 23503 is foreign_key_violation. The adapter names the
    // failure, and the sync fails with unknown-user (#137).
    const unknown = randomUUID();
    await expect(syncWith().execute(syncRequest(unknown, 1, []))).resolves.toEqual({
      ok: false,
      error: { kind: 'unknown-user' },
    });
    expect(await progressRows(unknown)).toEqual([]);
    expect(await snapshot(player)).toBe(before);

    // Each failure released the lock, so the next sync of the key completes.
    expect((await syncWith().execute(syncRequest(player, 60, [3]))).ok).toBe(true);
  });

  it('should_create_one_progress_without_unique_violation_when_first_syncs_of_a_game_overlap', async () => {
    const player = await newPlayer();
    const sync = syncWith();

    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => sync.execute(syncRequest(player, i, [i]))),
    );

    expect(outcomes.map((outcome) => outcome.status)).toEqual(
      Array.from({ length: 10 }, () => 'fulfilled'),
    );
    expect(await progressRows(player)).toHaveLength(1);
  });
});
