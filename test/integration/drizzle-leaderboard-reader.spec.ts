import { eq, getTableColumns, sql } from 'drizzle-orm';
import { DrizzleLeaderboardReader } from '../../src/adapters/persistence/drizzle-leaderboard-reader.js';
import { DrizzleProgressRepository } from '../../src/adapters/persistence/drizzle-progress-repository.js';
import {
  levelResults,
  progress as progressRows,
  users,
} from '../../src/adapters/persistence/schema.js';
import { ElapsedTime } from '../../src/domain/shared/elapsed-time.js';
import { GameId } from '../../src/domain/shared/game-id.js';
import { LevelId } from '../../src/domain/shared/level-id.js';
import type { LevelResult } from '../../src/domain/progress/level-result.js';
import { LevelsCompleted } from '../../src/domain/progress/levels-completed.js';
import { Moves } from '../../src/domain/shared/moves.js';
import { Standing } from '../../src/domain/progress/standing.js';
import { Stars } from '../../src/domain/shared/stars.js';
import type { Result } from '../../src/domain/shared/result.js';
import { describeGlobalBoardReaderContract } from '../support/global-board-reader.contract.js';
import { describeLevelBoardReaderContract } from '../support/level-board-reader.contract.js';
import { levelResultOf } from '../support/level-results.js';
import { byPlayer, type PlayedProgress, progressOf } from '../support/played-progress.js';
import { storeProgress } from '../support/progress-repository.contract.js';
import { syncInstantOf } from '../support/sync-instants.js';
import { createTestDatabase, type TestDatabase } from '../support/test-database.js';
import { testUserId } from '../support/user-ids.js';
import { valueOf } from '../support/result.js';

const ADA = testUserId(1);
const FIT = valueOf(GameId.of('fit'));
const LINES = valueOf(GameId.of('lines'));
const AT = syncInstantOf(new Date('2026-11-15T10:00:00.000Z'));

// One PGlite database serves the whole file. The start of a PGlite database
// takes more than one second on a slow runner, so one database for each test
// reaches the test timeout. Each test empties the three tables before it
// stores its rows.
let shared: TestDatabase;

// The text of each query that the shared database runs, in order. A test
// empties the list before the reads that it checks.
const sent: string[] = [];

beforeAll(async () => {
  shared = await createTestDatabase({
    logQuery(query) {
      sent.push(query);
    },
  });
});

afterAll(async () => {
  await shared.close();
});

function created<T>(result: Result<T, string>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

// The columns of the users table that the select list of a query names, with
// or without the name of the table. The select list ends at the first from,
// so the join condition on users.id is not part of it.
function usersColumnsSelectedBy(query: string): string[] {
  const selectList = query.slice(0, query.indexOf(' from '));
  return Object.values(getTableColumns(users))
    .map(({ name }) => name)
    .filter((name) => selectList.includes(`"${name}"`));
}

function level(levelId: string, stars: number, moves: number, elapsedMs: number): LevelResult {
  return levelResultOf({ levelId, stars, moves, elapsedMs });
}

function standing(stars: number, levels: number, moves: number, elapsedMs: number): Standing {
  return created(
    Standing.of(
      valueOf(Stars.of(stars)),
      created(LevelsCompleted.of(levels)),
      valueOf(Moves.of(moves)),
      valueOf(ElapsedTime.ofMs(elapsedMs)),
    ),
  );
}

// Empties the shared PGlite database, adds one account for each player of
// the progresses, named by the first username that a progress gives (#230),
// and stores each progress through DrizzleProgressRepository,
// the one writer of both tables (R-database-harness).
async function openDatabase(progresses: readonly PlayedProgress[]): Promise<TestDatabase> {
  const database = shared;
  await database.db.delete(levelResults);
  await database.db.delete(progressRows);
  await database.db.delete(users);
  const players = [...new Set(progresses.map(({ userId }) => userId))];
  if (players.length > 0) {
    await database.db.insert(users).values(
      players.map((id, index) => {
        const username =
          progresses.find((played) => played.userId === id && played.username !== undefined)
            ?.username ?? `player${index}`;
        return { id, username, usernameKey: username.toLowerCase(), passwordHash: 'scrypt$hash' };
      }),
    );
  }
  const repository = new DrizzleProgressRepository(database.db);
  for (const played of progresses) {
    await storeProgress(repository, progressOf(played, AT));
  }
  return database;
}

// One DrizzleLeaderboardReader over the shared database, with the given
// progresses stored.
async function readerOver(
  progresses: readonly PlayedProgress[],
): Promise<DrizzleLeaderboardReader> {
  return new DrizzleLeaderboardReader((await openDatabase(progresses)).db);
}

// API-FR-03: the leaderboards of one gameId, read from the progress and
// level_results tables of DS-5, with the username of each account from the
// users table (#230). One reader implements both board reader ports, so it
// runs both contracts (#218).
describeGlobalBoardReaderContract('DrizzleLeaderboardReader', readerOver);
describeLevelBoardReaderContract('DrizzleLeaderboardReader', readerOver);

describe('DrizzleLeaderboardReader', () => {
  // A stored total that is not a safe integer breaks the rule of its value
  // object. The border treats it as a server fault.
  it('should_reject_the_standings_when_a_total_is_not_a_safe_integer', async () => {
    const database = await openDatabase([
      {
        userId: ADA,
        gameId: FIT,
        results: [
          level('level-01', 1, 1, Number.MAX_SAFE_INTEGER),
          level('level-02', 1, 1, Number.MAX_SAFE_INTEGER),
        ],
      },
    ]);
    const reader = new DrizzleLeaderboardReader(database.db);

    await expect(reader.standings(FIT)).rejects.toThrow(
      new Error(`The level_results rows of user ${ADA} break the rule invalid-elapsed-time.`),
    );
  });

  // The elapsed time of one play is at most 2147483647 at the border (#167),
  // so the sum of the times of one player stays a safe integer for any
  // realistic number of levels, and the board of the standings still reads
  // it: the mirror of the rejection above.
  it('should_read_the_standings_when_the_sum_of_the_times_is_a_safe_integer', async () => {
    const database = await openDatabase([
      {
        userId: ADA,
        gameId: FIT,
        results: [level('level-01', 1, 1, 2_147_483_647), level('level-02', 1, 1, 2_147_483_647)],
      },
    ]);
    const reader = new DrizzleLeaderboardReader(database.db);

    const board = await reader.standings(FIT);

    expect(byPlayer(board)).toEqual([{ userId: ADA, result: standing(2, 2, 2, 4_294_967_294) }]);
  });

  // The users table holds no check of the name rule, so a writer that skips
  // the repository can store a name that breaks it. Username.create()
  // rejects it, and the reader treats it as a server fault.
  it('should_reject_each_board_when_a_stored_username_breaks_its_rule', async () => {
    const database = await openDatabase([
      { userId: ADA, gameId: FIT, results: [level('level-01', 3, 12, 40_000)] },
      { userId: ADA, gameId: LINES, score: 500 },
    ]);
    await database.db.update(users).set({ username: 'a b' }).where(eq(users.id, ADA));
    const reader = new DrizzleLeaderboardReader(database.db);
    const broken = new Error(`The users rows of user ${ADA} break the rule invalid-username.`);

    await expect(reader.levelResults(FIT, valueOf(LevelId.of('level-01')))).rejects.toThrow(broken);
    await expect(reader.standings(FIT)).rejects.toThrow(broken);
    await expect(reader.highScores(LINES)).rejects.toThrow(broken);
  });

  // #237: the users table also holds password_hash and username_key. Each
  // board reads only the username of an account, so each read selects no
  // other column of users. One query serves each board.
  it('should_select_only_the_username_of_users_when_each_board_is_read', async () => {
    const database = await openDatabase([
      { userId: ADA, gameId: FIT, results: [level('level-01', 3, 12, 40_000)] },
      { userId: ADA, gameId: LINES, score: 500 },
    ]);
    const reader = new DrizzleLeaderboardReader(database.db);
    const selectedBy = async (read: () => Promise<unknown>): Promise<string[][]> => {
      sent.length = 0;
      await read();
      return sent.map(usersColumnsSelectedBy);
    };

    const selected = {
      levelResults: await selectedBy(() =>
        reader.levelResults(FIT, valueOf(LevelId.of('level-01'))),
      ),
      standings: await selectedBy(() => reader.standings(FIT)),
      highScores: await selectedBy(() => reader.highScores(LINES)),
    };

    expect(selected).toEqual({
      levelResults: [['username']],
      standings: [['username']],
      highScores: [['username']],
    });
  });

  // #171: the keyed filters of the reader run on one index of level_results.
  // The board of one level filters on game_id and level_id, and the standings
  // of one game filter on game_id, so the index on those two columns serves
  // both reads. The index is not unique: the primary key keeps the rows.
  it('should_index_level_results_by_game_and_level_id_when_the_migrations_run', async () => {
    const index = await shared.db.execute<{ indexname: string; indexdef: string }>(
      sql`select indexname, indexdef from pg_indexes
          where tablename = 'level_results' order by indexname`,
    );

    expect(index.rows).toEqual([
      {
        indexname: 'level_results_game_id_level_id_idx',
        indexdef:
          'CREATE INDEX level_results_game_id_level_id_idx ON public.level_results USING btree (game_id, level_id)',
      },
      {
        indexname: 'level_results_user_id_game_id_level_id_pk',
        indexdef:
          'CREATE UNIQUE INDEX level_results_user_id_game_id_level_id_pk ON public.level_results USING btree (user_id, game_id, level_id)',
      },
    ]);
  });
});
