import { eq, sql } from 'drizzle-orm';
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
import { ProgressKey } from '../../src/domain/progress/progress-key.js';
import { Score } from '../../src/domain/progress/score.js';
import { Standing } from '../../src/domain/progress/standing.js';
import { Stars } from '../../src/domain/progress/stars.js';
import type { Result } from '../../src/domain/shared/result.js';
import { UserId } from '../../src/domain/user/user-id.js';
import { levelResultOf } from '../support/level-results.js';
import { storeProgress } from '../support/progress-repository.contract.js';
import { syncInstantOf } from '../support/sync-instants.js';
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
const AT = syncInstantOf(new Date('2026-11-15T10:00:00.000Z'));

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
    const progress = PlayerProgress.start(ProgressKey.of(valueOf(UserId.from(userId)), gameId), AT);
    if (score !== undefined) {
      progress.recordScore(valueOf(Score.of(score)), AT);
    }
    for (const result of results) {
      progress.recordLevel(result, AT);
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

// The userId and the username of each entry, as text, sorted by player.
function namesOf<T>(
  entries: readonly LeaderboardEntry<T>[],
): { userId: string; username: string }[] {
  return entries
    .map(({ userId, username }) => ({
      userId: receiveValueOf(userId),
      username: receiveValueOf(username),
    }))
    .sort((left, right) => left.userId.localeCompare(right.userId));
}

// API-FR-03: the leaderboards of one gameId, read from the progress and
// level_results tables of DS-5, with the username of each account from the
// users table (#230).
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

  // #230: each entry carries the Username of its account. The reader joins
  // the users table on the userId of each row, so every board names each
  // player by the name of the account.
  it('should_give_the_username_of_each_account_when_each_board_is_read', async () => {
    const database = await openDatabase([
      { userId: ADA, gameId: FIT, results: [level('level-01', 3, 12, 40_000)] },
      { userId: GRACE, gameId: FIT, results: [level('level-01', 1, 30, 90_000)] },
      { userId: LINUS, gameId: LINES, score: 700 },
    ]);
    const reader = new DrizzleLeaderboardReader(database.db);

    const levelBoard = await reader.levelResults(FIT, valueOf(LevelId.of('level-01')));
    const standings = await reader.standings(FIT);
    const highScores = await reader.highScores(LINES);

    const fitPlayers = [
      { userId: ADA, username: 'player0' },
      { userId: GRACE, username: 'player1' },
    ];
    expect(namesOf(levelBoard)).toEqual(fitPlayers);
    expect(namesOf(standings)).toEqual(fitPlayers);
    expect(namesOf(highScores)).toEqual([{ userId: LINUS, username: 'player2' }]);
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
