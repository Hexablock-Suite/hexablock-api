import { type Logger, sql } from 'drizzle-orm';
import { DrizzleProgressRepository } from '../../src/adapters/persistence/drizzle-progress-repository.js';
import { ProgressRowMapper } from '../../src/adapters/persistence/progress-row.mapper.js';
import { users } from '../../src/adapters/persistence/schema.js';
import { err } from '../../src/domain/shared/result.js';
import { SyncProgressUseCase } from '../../src/application/progress/sync-progress.use-case.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import type { LevelResult } from '../../src/domain/progress/level-result.js';
import { PlayerProgress } from '../../src/domain/progress/player-progress.js';
import { ProgressKey } from '../../src/domain/progress/progress-key.js';
import { Score } from '../../src/domain/progress/score.js';
import { UserId } from '../../src/domain/user/user-id.js';
import { FixedClock } from '../support/fixed-clock.js';
import { levelResultOf } from '../support/level-results.js';
import {
  CONTRACT_USER_IDS,
  describeProgressRepositoryContract,
  storeProgress,
} from '../support/progress-repository.contract.js';
import { progressPartsOf } from '../support/recording-receiver.js';
import { syncInstantOf } from '../support/sync-instants.js';
import { createTestDatabase, type TestDatabase } from '../support/test-database.js';
import { valueOf } from '../support/result.js';

// The text that the UserId delivers: the user_id of the rows.
const ADA_VALUE = CONTRACT_USER_IDS[0];
const ADA = valueOf(UserId.from(ADA_VALUE));
const UNKNOWN = valueOf(UserId.from('9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'));
const FIT = valueOf(GameId.of('fit'));
const ADA_FIT = ProgressKey.of(ADA, FIT);
// Each instant of the domain, and its Date, as the updated_at column keeps it.
const AT_TIME = new Date('2026-11-06T10:00:00.000Z');
const LATER_TIME = new Date('2026-11-06T10:05:00.000Z');
const AT = syncInstantOf(AT_TIME);
const LATER = syncInstantOf(LATER_TIME);

const openDatabases: TestDatabase[] = [];

// Opens a PGlite database with the contract users, so the progress foreign
// key to users.id holds (R-database-harness). The logger sees every query.
async function openDatabase(logger?: Logger): Promise<TestDatabase> {
  const database = await createTestDatabase(logger);
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
  return levelResultOf({ levelId, stars, moves, elapsedMs });
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

  // #107: the ProgressKey delivers the userId and the gameId to the lock
  // key and to the SQL filters. The text stays as it was before the key:
  // the lock key is "<userId>:<gameId>", and each query filters on both
  // columns. Two sessions that change one progress must take one lock, so
  // an instance with another lock key text would not wait for an old one.
  it('should_send_the_lock_key_and_the_filters_of_both_columns_when_update_and_find_run_with_a_key', async () => {
    const sent: { query: string; params: unknown[] }[] = [];
    const database = await openDatabase({
      logQuery(query, params) {
        sent.push({ query, params });
      },
    });
    const repository = new DrizzleProgressRepository(database.db);
    sent.length = 0;
    const progress = PlayerProgress.start(ADA_FIT, AT);
    progress.recordLevel(level('fit-01', 3, 9, 5), AT);

    await repository.update(ADA_FIT, () => progress);
    const sentByUpdate = sent.splice(0);
    await repository.find(ADA_FIT);

    const filterProgress =
      'select "user_id", "game_id", "high_score", "updated_at" from "progress" where ("progress"."user_id" = $1 and "progress"."game_id" = $2) limit $3';
    expect(sentByUpdate).toEqual([
      {
        query: 'select pg_advisory_xact_lock(hashtextextended($1, 0))',
        params: [`${ADA_VALUE}:fit`],
      },
      { query: filterProgress, params: [ADA_VALUE, 'fit', 1] },
      {
        query:
          'insert into "progress" ("user_id", "game_id", "high_score", "updated_at") values ($1, $2, $3, $4) on conflict ("user_id","game_id") do update set "high_score" = $5, "updated_at" = $6',
        params: [ADA_VALUE, 'fit', null, AT_TIME.toISOString(), null, AT_TIME.toISOString()],
      },
      {
        query:
          'delete from "level_results" where ("level_results"."user_id" = $1 and "level_results"."game_id" = $2)',
        params: [ADA_VALUE, 'fit'],
      },
      {
        query:
          'insert into "level_results" ("user_id", "game_id", "level_id", "stars", "moves", "elapsed_ms") values ($1, $2, $3, $4, $5, $6)',
        params: [ADA_VALUE, 'fit', 'fit-01', 3, 9, 5],
      },
    ]);
    expect(sent).toEqual([
      { query: filterProgress, params: [ADA_VALUE, 'fit', 1] },
      {
        query:
          'select "user_id", "game_id", "level_id", "stars", "moves", "elapsed_ms" from "level_results" where ("level_results"."user_id" = $1 and "level_results"."game_id" = $2) order by "level_results"."level_id" asc',
        params: [ADA_VALUE, 'fit'],
      },
    ]);
  });

  it('should_keep_one_progress_row_when_same_user_and_game_is_saved_twice', async () => {
    const database = await openDatabase();
    const repository = new DrizzleProgressRepository(database.db);
    await storeProgress(repository, PlayerProgress.start(ADA_FIT, AT));
    const second = PlayerProgress.start(ADA_FIT, AT);
    second.recordScore(valueOf(Score.of(300)), LATER);

    await storeProgress(repository, second);

    expect(await countRows(database, 'progress')).toBe(1);
    const found = await repository.find(ADA_FIT);
    expect(progressPartsOf(found)?.highScore?.equals(valueOf(Score.of(300)))).toBe(true);
    expect(progressPartsOf(found)?.updatedAt).toEqual(LATER);
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
      gameId: FIT,
      score: valueOf(Score.of(score)),
      results: [],
    });

    await Promise.all([sync.execute(syncRequest(500)), sync.execute(syncRequest(100))]);

    expect(
      progressPartsOf(await repository.find(ADA_FIT))?.highScore?.equals(valueOf(Score.of(500))),
    ).toBe(true);
    expect(await countRows(database, 'progress')).toBe(1);
  });

  it('should_read_back_every_level_result_when_aggregate_is_saved_and_found', async () => {
    const database = await openDatabase();
    const repository = new DrizzleProgressRepository(database.db);
    const progress = PlayerProgress.start(ADA_FIT, AT);
    const first = level('fit-01', 3, 9, 41_250);
    const second = level('fit-02', 1, 30, 3_000_000_000);
    progress.recordLevel(first, AT);
    progress.recordLevel(second, AT);

    await storeProgress(repository, progress);
    const found = await repository.find(ADA_FIT);

    expect(progressPartsOf(found)?.results).toEqual([first, second]);
    expect(progressPartsOf(found)?.highScore).toBeNull();
    expect(await countRows(database, 'level_results')).toBe(2);
  });

  it('should_replace_level_results_when_same_user_and_game_is_saved_again', async () => {
    const database = await openDatabase();
    const repository = new DrizzleProgressRepository(database.db);
    const progress = PlayerProgress.start(ADA_FIT, AT);
    progress.recordLevel(level('fit-01', 1, 20, 60_000), AT);
    await storeProgress(repository, progress);
    const retry = level('fit-01', 3, 9, 30_000);

    progress.recordLevel(retry, AT);
    progress.recordLevel(level('fit-02', 2, 12, 45_000), AT);
    await storeProgress(repository, progress);

    expect(progressPartsOf(await repository.find(ADA_FIT))?.results).toEqual(
      progressPartsOf(progress).results,
    );
    expect(progressPartsOf(await repository.find(ADA_FIT))?.results[0]).toEqual(retry);
    expect(await countRows(database, 'level_results')).toBe(2);
  });

  it('should_fail_with_unknown_user_and_write_no_row_when_user_is_unknown', async () => {
    const database = await openDatabase();
    const repository = new DrizzleProgressRepository(database.db);
    const progress = PlayerProgress.start(ProgressKey.of(UNKNOWN, FIT), AT);
    progress.recordLevel(level('fit-01', 3, 9, 1_000), AT);

    // The foreign key to users.id rejects the write with Postgres code
    // 23503, foreign_key_violation. The adapter names the failure (#137).
    await expect(storeProgress(repository, progress)).resolves.toEqual(err('unknown-user'));

    expect(await countRows(database, 'progress')).toBe(0);
    expect(await countRows(database, 'level_results')).toBe(0);
  });

  // find() filters on a valid GameId, so it never reads a row with another
  // game_id. The test calls the mapper of the adapter directly: a stored
  // row must pass the domain rules. A stored value that breaks its rule is a
  // server fault, so the mapper throws an Error with the code of the rule.
  it('should_throw_a_server_fault_with_the_code_of_the_rule_when_a_stored_game_id_is_not_a_slug', () => {
    const row = { userId: ADA_VALUE, gameId: 'Hexa Lines', highScore: null, updatedAt: AT_TIME };

    expect(() => ProgressRowMapper.toAggregate(row, [])).toThrow(
      new Error(
        `The progress rows of user ${ADA_VALUE} and game Hexa Lines break the rule invalid-game-id.`,
      ),
    );
  });

  // #97: the updated_at column also keeps the Postgres value 'infinity',
  // which no SyncInstant holds. The stored instant is a server fault, as the
  // other stored values are, so find() rejects with the code of the rule.
  it('should_reject_find_with_the_code_of_the_rule_when_a_stored_updated_at_is_not_a_valid_instant', async () => {
    const database = await openDatabase();
    const repository = new DrizzleProgressRepository(database.db);
    await database.db.execute(
      sql`insert into progress (user_id, game_id, high_score, updated_at) values (${ADA_VALUE}, 'fit', null, 'infinity')`,
    );

    await expect(repository.find(ADA_FIT)).rejects.toThrow(
      new Error(
        `The progress rows of user ${ADA_VALUE} and game fit break the rule invalid-sync-instant.`,
      ),
    );
  });

  // The column has no check constraint: Score checks the stored number again.
  it.each([-1, 2.5, 2 ** 53])(
    'should_throw_a_server_fault_with_the_code_of_the_rule_when_a_stored_high_score_breaks_its_rule',
    (highScore) => {
      const row = { userId: ADA_VALUE, gameId: 'fit', highScore, updatedAt: AT_TIME };

      expect(() => ProgressRowMapper.toAggregate(row, [])).toThrow(
        new Error(
          `The progress rows of user ${ADA_VALUE} and game fit break the rule invalid-score.`,
        ),
      );
    },
  );

  // The level_results columns keep text and numbers.
  it('should_write_level_results_as_text_and_numbers_when_aggregate_becomes_rows', () => {
    const played = PlayerProgress.start(ADA_FIT, AT);
    played.recordLevel(level('fit-01', 3, 12, 45_000), AT);
    const rows = [
      {
        userId: ADA_VALUE,
        gameId: 'fit',
        levelId: 'fit-01',
        stars: 3,
        moves: 12,
        elapsedMs: 45_000,
      },
    ];

    expect(ProgressRowMapper.toLevelResultRows(played)).toEqual(rows);
    const row = { userId: ADA_VALUE, gameId: 'fit', highScore: null, updatedAt: AT_TIME };
    expect(ProgressRowMapper.toLevelResultRows(ProgressRowMapper.toAggregate(row, rows))).toEqual(
      rows,
    );
  });

  // A stored level result must pass the rules of its value objects. The
  // mapper combines the four Results, and the first broken rule names its code.
  it.each([
    [{ levelId: ' ', stars: -1 }, 'invalid-level-id'],
    [{ stars: -1, moves: -1 }, 'invalid-stars'],
    [{ moves: 1.5, elapsedMs: -1 }, 'invalid-moves'],
    [{ elapsedMs: -1 }, 'invalid-elapsed-time'],
  ])(
    'should_throw_a_server_fault_with_the_first_broken_rule_when_a_stored_level_result_breaks_a_rule',
    (broken, code) => {
      const row = { userId: ADA_VALUE, gameId: 'fit', highScore: null, updatedAt: AT_TIME };
      const stored = {
        userId: ADA_VALUE,
        gameId: 'fit',
        levelId: 'fit-01',
        stars: 3,
        moves: 12,
        elapsedMs: 45_000,
      };

      expect(() => ProgressRowMapper.toAggregate(row, [{ ...stored, ...broken }])).toThrow(
        new Error(`The progress rows of user ${ADA_VALUE} and game fit break the rule ${code}.`),
      );
    },
  );

  // The row keeps a number: the high_score column does not change.
  it('should_write_the_high_score_as_a_number_or_null_when_aggregate_becomes_a_row', () => {
    const scored = PlayerProgress.start(ADA_FIT, AT);
    scored.recordScore(valueOf(Score.of(120)), LATER);

    expect(ProgressRowMapper.toProgressRow(scored)).toEqual({
      userId: ADA_VALUE,
      gameId: 'fit',
      highScore: 120,
      updatedAt: LATER_TIME,
    });
    expect(ProgressRowMapper.toProgressRow(PlayerProgress.start(ADA_FIT, AT)).highScore).toBeNull();
    const row = { userId: ADA_VALUE, gameId: 'fit', highScore: 120, updatedAt: LATER_TIME };
    expect(ProgressRowMapper.toProgressRow(ProgressRowMapper.toAggregate(row, []))).toEqual(row);
  });
});
