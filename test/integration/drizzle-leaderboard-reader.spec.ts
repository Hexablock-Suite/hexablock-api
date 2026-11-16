import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { DrizzleLeaderboardReader } from '../../src/adapters/persistence/drizzle-leaderboard-reader.js';
import { DrizzleProgressRepository } from '../../src/adapters/persistence/drizzle-progress-repository.js';
import {
  levelResults,
  progress as progressRows,
  users,
} from '../../src/adapters/persistence/schema.js';
import { receiveValueOf } from '../../src/adapters/received.js';
import type { LeaderboardEntry } from '../../src/application/ports/leaderboard-entry.js';
import { ElapsedTime } from '../../src/domain/progress/elapsed-time.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { LevelId } from '../../src/domain/progress/level-id.js';
import type { LevelResult } from '../../src/domain/progress/level-result.js';
import { LevelsCompleted } from '../../src/domain/progress/levels-completed.js';
import { Moves } from '../../src/domain/progress/moves.js';
import { PlayerProgress } from '../../src/domain/progress/player-progress.js';
import { Score } from '../../src/domain/progress/score.js';
import { Standing } from '../../src/domain/progress/standing.js';
import { Stars } from '../../src/domain/progress/stars.js';
import type { Result } from '../../src/domain/shared/result.js';
import { UserId } from '../../src/domain/user/user-id.js';
import { levelResultOf } from '../support/level-results.js';
import { storeProgress } from '../support/progress-repository.contract.js';
import { createTestDatabase, type TestDatabase } from '../support/test-database.js';
import { testUserId } from '../support/user-ids.js';
import { valueOf } from '../support/result.js';

const ADA = testUserId(1);
const GRACE = testUserId(2);
const LINUS = testUserId(3);
const FIT = valueOf(GameId.of('fit'));
const SORT = valueOf(GameId.of('sort'));
const LINES = valueOf(GameId.of('lines'));
const MERGE = valueOf(GameId.of('merge'));
const AT = new Date('2026-11-15T10:00:00.000Z');
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

// The progress of one player in one game: an optional high score and level results.
interface Played {
  readonly userId: string;
  readonly gameId: GameId;
  readonly score?: number;
  readonly results?: readonly LevelResult[];
}

// Empties the shared PGlite database, adds three players and stores each
// progress through DrizzleProgressRepository, the one writer of both tables
// (R-database-harness).
async function openDatabase(progresses: readonly Played[]): Promise<TestDatabase> {
  const database = shared;
  await database.db.delete(levelResults);
  await database.db.delete(progressRows);
  await database.db.delete(users);
  await database.db.insert(users).values(
    [ADA, GRACE, LINUS].map((id, index) => ({
      id,
      username: `player${index}`,
      usernameKey: `player${index}`,
      passwordHash: 'scrypt$hash',
    })),
  );
  const repository = new DrizzleProgressRepository(database.db);
  for (const { userId, gameId, score, results = [] } of progresses) {
    const progress = PlayerProgress.start(valueOf(UserId.from(userId)), gameId, AT);
    if (score !== undefined) {
      progress.recordScore(valueOf(Score.of(score)), AT);
    }
    for (const result of results) {
      progress.recordLevel(result);
    }
    await storeProgress(repository, progress);
  }
  return database;
}

// The port gives the entries in no order. The test sorts them by player.
function byPlayer<T>(entries: readonly LeaderboardEntry<T>[]): { userId: string; result: T }[] {
  return entries
    .map(({ userId, result }) => ({ userId: receiveValueOf(userId), result }))
    .sort((left, right) => left.userId.localeCompare(right.userId));
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
// level_results tables of DS-5.
describe('DrizzleLeaderboardReader', () => {
  it('should_give_the_stored_result_of_each_player_when_the_board_of_one_level_is_read', async () => {
    const database = await openDatabase([
      {
        userId: ADA,
        gameId: FIT,
        results: [level('level-01', 3, 12, 40_000), level('level-02', 2, 20, 60_000)],
      },
      { userId: GRACE, gameId: FIT, results: [level('level-01', 1, 30, 90_000)] },
      { userId: LINUS, gameId: FIT, score: 0 },
      { userId: LINUS, gameId: SORT, results: [level('level-01', 3, 5, 1_000)] },
    ]);
    const reader = new DrizzleLeaderboardReader(database.db);

    const board = await reader.levelResults(FIT, valueOf(LevelId.of('level-01')));

    expect(byPlayer(board)).toEqual([
      { userId: ADA, result: level('level-01', 3, 12, 40_000) },
      { userId: GRACE, result: level('level-01', 1, 30, 90_000) },
    ]);
  });

  // S3-03: the global board of Fit and Sort sums the stored results of each
  // player. It reads no high score: Fit gives no points per turn.
  it('should_sum_the_level_results_of_each_player_when_the_standings_of_one_game_are_read', async () => {
    const database = await openDatabase([
      {
        userId: ADA,
        gameId: FIT,
        score: 900,
        results: [level('level-01', 3, 12, 40_000), level('level-02', 2, 20, 60_000)],
      },
      { userId: GRACE, gameId: FIT, results: [level('level-01', 1, 30, 90_000)] },
      { userId: LINUS, gameId: FIT, score: 0 },
      { userId: LINUS, gameId: SORT, results: [level('level-01', 3, 5, 1_000)] },
    ]);
    const reader = new DrizzleLeaderboardReader(database.db);

    const board = await reader.standings(FIT);

    expect(byPlayer(board)).toEqual([
      { userId: ADA, result: standing(5, 2, 32, 100_000) },
      { userId: GRACE, result: standing(1, 1, 30, 90_000) },
    ]);
  });

  it('should_give_the_high_score_of_each_player_who_has_one_when_the_high_scores_of_one_game_are_read', async () => {
    const database = await openDatabase([
      { userId: ADA, gameId: LINES, score: 500 },
      { userId: GRACE, gameId: LINES, score: 700 },
      { userId: LINUS, gameId: LINES },
      { userId: LINUS, gameId: MERGE, score: 300 },
    ]);
    const reader = new DrizzleLeaderboardReader(database.db);

    const board = await reader.highScores(LINES);

    expect(byPlayer(board)).toEqual([
      { userId: ADA, result: valueOf(Score.of(500)) },
      { userId: GRACE, result: valueOf(Score.of(700)) },
    ]);
  });

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

  // The users table belongs to the user module. The reader reads only the
  // tables of the progress module, so it names no table or column of users.
  it('should_name_no_table_or_column_of_users_when_the_reader_source_is_read', () => {
    const names = namesIn(READER_SOURCE);

    expect(names).toEqual(expect.arrayContaining(['progress', 'levelResults']));
    expect(names.filter((name) => /users|username|password/i.test(name))).toEqual([]);
  });
});
