import { sql } from 'drizzle-orm';
import { DrizzleProgressRepository } from '../../src/adapters/persistence/drizzle-progress-repository.js';
import { ProgressRowMapper } from '../../src/adapters/persistence/progress-row.mapper.js';
import { users } from '../../src/adapters/persistence/schema.js';
import { SyncProgressUseCase } from '../../src/application/progress/sync-progress.use-case.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { LevelResult } from '../../src/domain/progress/level-result.js';
import { PlayerProgress } from '../../src/domain/progress/player-progress.js';
import { ProgressError } from '../../src/domain/progress/progress-error.js';
import { UserId } from '../../src/domain/user/user-id.js';
import { FixedClock } from '../support/fixed-clock.js';
import {
  CONTRACT_USER_IDS,
  describeProgressRepositoryContract,
  storeProgress,
} from '../support/progress-repository.contract.js';
import { createTestDatabase, type TestDatabase } from '../support/test-database.js';

const ADA = UserId.from(CONTRACT_USER_IDS[0]);
const UNKNOWN = UserId.from('9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d');
const FIT = GameId.of('fit');
const AT = new Date('2026-11-06T10:00:00.000Z');
const LATER = new Date('2026-11-06T10:05:00.000Z');

const openDatabases: TestDatabase[] = [];

// Opens a PGlite database with the contract users, so the progress foreign
// key to users.id holds (R-database-harness).
async function openDatabase(): Promise<TestDatabase> {
  const database = await createTestDatabase();
  openDatabases.push(database);
  await database.db.insert(users).values(
    CONTRACT_USER_IDS.map((id, index) => ({
      id,
      username: `player${index}`,
      usernameKey: `player${index}`,
      passwordHash: 'scrypt$hash',
    })),
  );
  return database;
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((database) => database.close()));
});

describeProgressRepositoryContract('DrizzleProgressRepository', async () => {
  const database = await openDatabase();
  return new DrizzleProgressRepository(database.db);
});

async function countRows(database: TestDatabase, table: 'progress' | 'level_results') {
  const result = await database.db.execute<{ count: number }>(
    sql`select count(*)::int as count from ${sql.identifier(table)}`,
  );
  return result.rows[0]?.count;
}

function level(levelId: string, stars: number, moves: number, elapsedMs: number): LevelResult {
  return LevelResult.of({ levelId, stars, moves, elapsedMs });
}

// API-FR-02 and DS-5: one progress aggregate over two tables.
describe('DrizzleProgressRepository', () => {
  it('should_create_progress_and_level_results_tables_when_migrations_run', async () => {
    const database = await openDatabase();

    const columns = await database.db.execute<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      sql`select table_name, column_name, data_type, is_nullable from information_schema.columns
          where table_name in ('progress', 'level_results') order by table_name, column_name`,
    );
    const keys = await database.db.execute<{
      table_name: string;
      constraint_type: string;
      columns: string;
    }>(
      sql`select tc.table_name, tc.constraint_type,
                 string_agg(kcu.column_name, ',' order by kcu.ordinal_position) as columns
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on kcu.constraint_name = tc.constraint_name and kcu.table_name = tc.table_name
          where tc.table_name in ('progress', 'level_results')
            and tc.constraint_type in ('PRIMARY KEY', 'FOREIGN KEY')
          group by tc.table_name, tc.constraint_type, tc.constraint_name
          order by tc.table_name, tc.constraint_type, columns`,
    );

    expect(columns.rows).toEqual([
      {
        table_name: 'level_results',
        column_name: 'elapsed_ms',
        data_type: 'bigint',
        is_nullable: 'NO',
      },
      { table_name: 'level_results', column_name: 'game_id', data_type: 'text', is_nullable: 'NO' },
      {
        table_name: 'level_results',
        column_name: 'level_id',
        data_type: 'text',
        is_nullable: 'NO',
      },
      {
        table_name: 'level_results',
        column_name: 'moves',
        data_type: 'integer',
        is_nullable: 'NO',
      },
      {
        table_name: 'level_results',
        column_name: 'stars',
        data_type: 'integer',
        is_nullable: 'NO',
      },
      { table_name: 'level_results', column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
      { table_name: 'progress', column_name: 'game_id', data_type: 'text', is_nullable: 'NO' },
      {
        table_name: 'progress',
        column_name: 'high_score',
        data_type: 'bigint',
        is_nullable: 'YES',
      },
      {
        table_name: 'progress',
        column_name: 'updated_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      },
      { table_name: 'progress', column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
    ]);
    expect(keys.rows).toEqual([
      { table_name: 'level_results', constraint_type: 'FOREIGN KEY', columns: 'user_id,game_id' },
      {
        table_name: 'level_results',
        constraint_type: 'PRIMARY KEY',
        columns: 'user_id,game_id,level_id',
      },
      { table_name: 'progress', constraint_type: 'FOREIGN KEY', columns: 'user_id' },
      { table_name: 'progress', constraint_type: 'PRIMARY KEY', columns: 'user_id,game_id' },
    ]);
  });

  it('should_keep_one_progress_row_when_same_user_and_game_is_saved_twice', async () => {
    const database = await openDatabase();
    const repository = new DrizzleProgressRepository(database.db);
    await storeProgress(repository, PlayerProgress.start(ADA, FIT, AT));
    const second = PlayerProgress.start(ADA, FIT, AT);
    second.recordScore(300, LATER);

    await storeProgress(repository, second);

    expect(await countRows(database, 'progress')).toBe(1);
    const found = await repository.find(ADA, FIT);
    expect(found?.highScore).toBe(300);
    expect(found?.updatedAt.toISOString()).toBe(LATER.toISOString());
  });

  // The advisory lock makes the second sync read what the first one saved,
  // and the domain keeps the highest score (API-FR-02). PGlite runs one
  // session, so this test shows the result, not the lock under real
  // concurrent Postgres sessions.
  it('should_keep_highest_score_when_two_syncs_of_same_game_overlap', async () => {
    const database = await openDatabase();
    const repository = new DrizzleProgressRepository(database.db);
    const sync = new SyncProgressUseCase(repository, new FixedClock(AT));
    const syncRequest = (score: number) => ({
      userId: ADA,
      gameId: FIT.value,
      score,
      results: [],
    });

    await Promise.all([sync.execute(syncRequest(500)), sync.execute(syncRequest(100))]);

    expect((await repository.find(ADA, FIT))?.highScore).toBe(500);
    expect(await countRows(database, 'progress')).toBe(1);
  });

  it('should_read_back_every_level_result_when_aggregate_is_saved_and_found', async () => {
    const database = await openDatabase();
    const repository = new DrizzleProgressRepository(database.db);
    const progress = PlayerProgress.start(ADA, FIT, AT);
    const first = level('fit-01', 3, 9, 41_250);
    const second = level('fit-02', 1, 30, 3_000_000_000);
    progress.recordLevel(first);
    progress.recordLevel(second);

    await storeProgress(repository, progress);
    const found = await repository.find(ADA, FIT);

    expect(found?.results).toEqual([first, second]);
    expect(found?.highScore).toBeNull();
    expect(await countRows(database, 'level_results')).toBe(2);
  });

  it('should_replace_level_results_when_same_user_and_game_is_saved_again', async () => {
    const database = await openDatabase();
    const repository = new DrizzleProgressRepository(database.db);
    const progress = PlayerProgress.start(ADA, FIT, AT);
    progress.recordLevel(level('fit-01', 1, 20, 60_000));
    await storeProgress(repository, progress);
    const retry = level('fit-01', 3, 9, 30_000);

    progress.recordLevel(retry);
    progress.recordLevel(level('fit-02', 2, 12, 45_000));
    await storeProgress(repository, progress);

    expect((await repository.find(ADA, FIT))?.results).toEqual(progress.results);
    expect((await repository.find(ADA, FIT))?.results[0]).toEqual(retry);
    expect(await countRows(database, 'level_results')).toBe(2);
  });

  it('should_reject_save_and_write_no_row_when_user_is_unknown', async () => {
    const database = await openDatabase();
    const repository = new DrizzleProgressRepository(database.db);
    const progress = PlayerProgress.start(UNKNOWN, FIT, AT);
    progress.recordLevel(level('fit-01', 3, 9, 1_000));

    // Postgres code 23503 is foreign_key_violation.
    await expect(storeProgress(repository, progress)).rejects.toMatchObject({
      cause: { code: '23503' },
    });

    expect(await countRows(database, 'progress')).toBe(0);
    expect(await countRows(database, 'level_results')).toBe(0);
  });

  // find() filters on a valid GameId, so it never reads a row with another
  // game_id. The test calls the mapper of the adapter directly: a stored
  // row must pass the domain rules, as PlayerProgress.restore() says.
  it('should_reject_stored_row_when_game_id_is_not_a_slug', () => {
    const row = { userId: ADA.value, gameId: 'Hexa Lines', highScore: null, updatedAt: AT };

    expect(() => ProgressRowMapper.toAggregate(row, [])).toThrow(ProgressError);
    expect(() => ProgressRowMapper.toAggregate(row, [])).toThrow(
      'gameId must be a lowercase slug, got "Hexa Lines".',
    );
  });
});
