import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { sql } from 'drizzle-orm';
import { DrizzleLeaderboardReader } from '../../src/adapters/persistence/drizzle-leaderboard-reader.js';
import { DrizzleProgressRepository } from '../../src/adapters/persistence/drizzle-progress-repository.js';
import {
  levelResults,
  progress as progressRows,
  users,
} from '../../src/adapters/persistence/schema.js';
import { ElapsedTime } from '../../src/domain/progress/elapsed-time.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import type { LevelResult } from '../../src/domain/progress/level-result.js';
import { LevelsCompleted } from '../../src/domain/progress/levels-completed.js';
import { Moves } from '../../src/domain/progress/moves.js';
import { Standing } from '../../src/domain/progress/standing.js';
import { Stars } from '../../src/domain/progress/stars.js';
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
const AT = syncInstantOf(new Date('2026-11-15T10:00:00.000Z'));
const READER_SOURCE = resolve(
  import.meta.dirname,
  '../../src/adapters/persistence/drizzle-leaderboard-reader.ts',
);

// One PGlite database serves the whole file. The start of a PGlite database
// takes more than one second on a slow runner, so one database for each test
// reaches the test timeout. Each test empties the three tables before it
// stores its rows.
let shared: TestDatabase;

beforeAll(async () => {
  shared = await createTestDatabase();
});

afterAll(async () => {
  await shared.close();
});

function created<T>(result: Result<T, string>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
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
// the progresses and stores each progress through DrizzleProgressRepository,
// the one writer of both tables (R-database-harness).
async function openDatabase(progresses: readonly PlayedProgress[]): Promise<TestDatabase> {
  const database = shared;
  await database.db.delete(levelResults);
  await database.db.delete(progressRows);
  await database.db.delete(users);
  const players = [...new Set(progresses.map(({ userId }) => userId))];
  if (players.length > 0) {
    await database.db.insert(users).values(
      players.map((id, index) => ({
        id,
        username: `player${index}`,
        usernameKey: `player${index}`,
        passwordHash: 'scrypt$hash',
      })),
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

// Every identifier and every text literal of a TypeScript file, comments excluded.
function namesIn(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      names.push(node.text);
    } else if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      names.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

// API-FR-03: the leaderboards of one gameId, read from the progress and
// level_results tables of DS-5. One reader implements both board reader
// ports, so it runs both contracts (#218).
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

  // The users table belongs to the user module. The reader reads only the
  // tables of the progress module, so it names no table or column of users.
  it('should_name_no_table_or_column_of_users_when_the_reader_source_is_read', () => {
    const names = namesIn(READER_SOURCE);

    expect(names).toEqual(expect.arrayContaining(['progress', 'levelResults']));
    expect(names.filter((name) => /users|username|password/i.test(name))).toEqual([]);
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
