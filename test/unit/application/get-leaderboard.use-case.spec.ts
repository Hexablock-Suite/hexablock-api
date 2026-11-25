import { LoggingAspect } from '../../../src/application/aspects/logging-aspect.js';
import {
  GetLeaderboardUseCase,
  type Leaderboard,
} from '../../../src/application/leaderboard/get-leaderboard.use-case.js';
import type { LeaderboardEntry } from '../../../src/application/ports/leaderboard-entry.js';
import type { LeaderboardReader } from '../../../src/application/ports/leaderboard-reader.js';
import type { Logger, UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import type { LevelResult } from '../../../src/domain/progress/level-result.js';
import { RankedBoard } from '../../../src/domain/progress/ranked-board.js';
import { Score } from '../../../src/domain/progress/score.js';
import type { Standing } from '../../../src/domain/progress/standing.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { InMemoryLevelRepository } from '../../support/in-memory-level-repository.js';
import { levelJson, levelValidators } from '../../support/level-format.js';
import { storeLevel } from '../../support/level-repository.contract.js';
import { levelResultOf } from '../../support/level-results.js';
import { testUserId } from '../../support/user-ids.js';
import { valueOf } from '../../support/result.js';

const FIT = valueOf(GameId.of('hexa-fit'));
const LINES = valueOf(GameId.of('hexa-lines'));
const LEVEL = valueOf(LevelId.of('fit-01'));

function player(n: number): UserId {
  return valueOf(UserId.from(testUserId(n)));
}

function levelResult(stars: number, moves: number, elapsedMs: number): LevelResult {
  return levelResultOf({ levelId: 'fit-01', stars, moves, elapsedMs });
}

function entry<TResult>(n: number, result: TResult): LeaderboardEntry<TResult> {
  return { userId: player(n), result };
}

interface Rows {
  readonly levelResults?: LeaderboardEntry<LevelResult>[];
  readonly highScores?: LeaderboardEntry<Score>[];
  readonly standings?: LeaderboardEntry<Standing>[];
}

// Test double for the LeaderboardReader port. It gives the rows in the order
// of the test, as the port gives them in no order, and records each call.
function readerOf(rows: Rows) {
  return {
    levelResults: vi.fn<LeaderboardReader['levelResults']>(() =>
      Promise.resolve(rows.levelResults ?? []),
    ),
    highScores: vi.fn<LeaderboardReader['highScores']>(() =>
      Promise.resolve(rows.highScores ?? []),
    ),
    standings: vi.fn<LeaderboardReader['standings']>(() => Promise.resolve(rows.standings ?? [])),
  } satisfies LeaderboardReader;
}

// The level definitions of the tests: they hold fit-01 of Fit, the level
// of every level board below.
async function storedLevels(): Promise<InMemoryLevelRepository> {
  const levels = new InMemoryLevelRepository(levelValidators());
  await storeLevel(levels, levelJson('hexa-fit', 'fit-01'));
  return levels;
}

async function useCaseOf(reader: LeaderboardReader): Promise<GetLeaderboardUseCase> {
  return new GetLeaderboardUseCase(reader, await storedLevels());
}

async function boardOf(
  reader: LeaderboardReader,
  query: Parameters<GetLeaderboardUseCase['execute']>[0],
): Promise<Leaderboard> {
  const result = await (await useCaseOf(reader)).execute(query);
  if (!result.ok) throw new Error(`GetLeaderboard failed with ${result.error.kind}.`);
  return result.value;
}

// API-FR-03. The reader only filters and sums. The domain ranks each board:
// the use case builds RankedBoard.of() with the rows of the reader and
// orders nothing (decision of #83). The RankedBoard spec pins the order and
// the shared rank of the board.
describe('GetLeaderboardUseCase (API-FR-03)', () => {
  // The use case asks the reader for the board of one level only, and the
  // board that it answers holds the rows that the reader gave, ranked by
  // the domain. Two entries with different stars pin that the board is
  // ranked, not raw.
  it('should_rank_the_level_board_through_the_domain_when_the_reader_gives_entries_in_no_order', async () => {
    const twoStars = entry(4, levelResult(2, 10, 40_000));
    const threeStars = entry(2, levelResult(3, 10, 40_000));
    const reader = readerOf({ levelResults: [twoStars, threeStars] });

    const board = await boardOf(reader, { board: 'level', gameId: FIT, levelId: LEVEL });

    expect(board).toEqual({
      board: 'level',
      gameId: FIT,
      levelId: LEVEL,
      entries: RankedBoard.of([
        { userId: player(2), result: levelResult(3, 10, 40_000) },
        { userId: player(4), result: levelResult(2, 10, 40_000) },
      ]),
    });
    expect(reader.levelResults).toHaveBeenCalledExactlyOnceWith(FIT, LEVEL);
    expect(reader.highScores).not.toHaveBeenCalled();
    expect(reader.standings).not.toHaveBeenCalled();
  });

  // The global board reads both boards of the game through the reader and
  // ranks them through the domain (S3-03).
  it('should_rank_both_global_boards_through_the_domain_when_the_reader_gives_entries_in_no_order', async () => {
    const low = entry(1, valueOf(Score.of(80)));
    const high = entry(2, valueOf(Score.of(2048)));
    const reader = readerOf({ highScores: [low, high], standings: [] });

    const board = await boardOf(reader, { board: 'global', gameId: LINES });

    expect(board).toEqual({
      board: 'global',
      gameId: LINES,
      highScores: RankedBoard.of([
        { userId: player(2), result: valueOf(Score.of(2048)) },
        { userId: player(1), result: valueOf(Score.of(80)) },
      ]),
      standings: RankedBoard.of([]),
    });
    expect(reader.highScores).toHaveBeenCalledExactlyOnceWith(LINES);
    expect(reader.standings).toHaveBeenCalledExactlyOnceWith(LINES);
    expect(reader.levelResults).not.toHaveBeenCalled();
  });

  // A board lists only the players who have a result to rank (decision of
  // #82). An empty board is a board, not a failure.
  it('should_give_empty_boards_and_succeed_when_the_reader_has_no_entries', async () => {
    const reader = readerOf({});

    const levelResult = await (
      await useCaseOf(reader)
    ).execute({
      board: 'level',
      gameId: FIT,
      levelId: LEVEL,
    });
    const globalResult = await (
      await useCaseOf(reader)
    ).execute({
      board: 'global',
      gameId: FIT,
    });

    expect(levelResult).toEqual({
      ok: true,
      value: {
        board: 'level',
        gameId: FIT,
        levelId: LEVEL,
        entries: RankedBoard.of([]),
      },
    });
    expect(globalResult).toEqual({
      ok: true,
      value: {
        board: 'global',
        gameId: FIT,
        highScores: RankedBoard.of([]),
        standings: RankedBoard.of([]),
      },
    });
  });

  // GetLeaderboard binds UseCase, so LoggingAspect wraps it. The use case
  // holds no logging code (decision 7).
  it('should_log_get_leaderboard_success_and_return_the_board_unchanged_when_logging_aspect_wraps_it', async () => {
    const score = entry(1, valueOf(Score.of(120)));
    const logger = { log: vi.fn<(entry: UseCaseLogEntry) => void>() } satisfies Logger;
    const inner = await useCaseOf(readerOf({ highScores: [score] }));
    const aspect = new LoggingAspect(inner, 'GetLeaderboard', logger);

    const result = await aspect.execute({ board: 'global', gameId: LINES });

    expect(result).toEqual({
      ok: true,
      value: {
        board: 'global',
        gameId: LINES,
        highScores: RankedBoard.of([{ userId: player(1), result: valueOf(Score.of(120)) }]),
        standings: RankedBoard.of([]),
      },
    });
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'GetLeaderboard',
      outcome: 'success',
    });
  });

  // #146: the API holds every level, so a level that the definitions do
  // not hold has no board. The use case asks the level store first and
  // reads no result. An unknown level, an unknown game and a level of
  // another game are each unknown.
  it.each([
    ['hexa-fit', 'no-such-level'],
    ['no-such-game', 'fit-01'],
    ['hexa-lines', 'fit-01'],
  ])(
    'should_fail_with_unknown_level_and_read_no_result_when_the_definitions_do_not_hold_the_level',
    async (game, level) => {
      const reader = readerOf({ levelResults: [entry(1, levelResult(3, 10, 40_000))] });

      const result = await (
        await useCaseOf(reader)
      ).execute({
        board: 'level',
        gameId: valueOf(GameId.of(game)),
        levelId: valueOf(LevelId.of(level)),
      });

      expect(result).toEqual({ ok: false, error: { kind: 'unknown-level' } });
      expect(reader.levelResults).not.toHaveBeenCalled();
    },
  );

  // A broken row is still a level that the definitions hold, so its board
  // answers as a stored level does.
  it('should_give_the_level_board_when_the_definitions_hold_the_level_as_a_broken_row', async () => {
    const levels = new InMemoryLevelRepository(levelValidators());
    levels.storeRow({ ...levelJson('hexa-fit', 'fit-01'), section: { figure: [] } });
    const reader = readerOf({});

    const result = await new GetLeaderboardUseCase(reader, levels).execute({
      board: 'level',
      gameId: FIT,
      levelId: LEVEL,
    });

    expect(result).toEqual({
      ok: true,
      value: { board: 'level', gameId: FIT, levelId: LEVEL, entries: RankedBoard.of([]) },
    });
  });

  // LoggingAspect logs the kind of the failure and returns it unchanged.
  it('should_log_the_unknown_level_failure_when_logging_aspect_wraps_get_leaderboard', async () => {
    const logger = { log: vi.fn<(entry: UseCaseLogEntry) => void>() } satisfies Logger;
    const aspect = new LoggingAspect(await useCaseOf(readerOf({})), 'GetLeaderboard', logger);

    const result = await aspect.execute({
      board: 'level',
      gameId: FIT,
      levelId: valueOf(LevelId.of('fit-99')),
    });

    expect(result).toEqual({ ok: false, error: { kind: 'unknown-level' } });
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'GetLeaderboard',
      outcome: 'failure',
      kind: 'unknown-level',
    });
  });
});
