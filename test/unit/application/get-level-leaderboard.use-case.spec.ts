import { LoggingAspect } from '../../../src/application/aspects/logging-aspect.js';
import {
  GetLevelLeaderboardUseCase,
  type LevelBoardQuery,
} from '../../../src/application/leaderboard/get-level-leaderboard.use-case.js';
import type { LeaderboardEntry } from '../../../src/application/ports/leaderboard-entry.js';
import type { LevelBoardReader } from '../../../src/application/ports/level-board-reader.js';
import type { LevelHolder } from '../../../src/application/ports/level-repository.js';
import type { Logger, UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import type { LevelResult } from '../../../src/domain/progress/level-result.js';
import { RankedBoard } from '../../../src/domain/progress/ranked-board.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { Username } from '../../../src/domain/user/username.js';
import { InMemoryLevelRepository } from '../../support/in-memory-level-repository.js';
import { FakeStopwatch } from '../../support/fake-stopwatch.js';
import { levelJson, levelValidators } from '../../support/level-format.js';
import { storeLevel } from '../../support/level-repository.contract.js';
import { levelResultOf } from '../../support/level-results.js';
import { testUserId } from '../../support/user-ids.js';
import { valueOf } from '../../support/result.js';

const FIT = valueOf(GameId.of('hexa-fit'));
const LEVEL = valueOf(LevelId.of('fit-01'));
const QUERY: LevelBoardQuery = { gameId: FIT, levelId: LEVEL };

function player(n: number): UserId {
  return valueOf(UserId.from(testUserId(n)));
}

function levelResult(stars: number, moves: number, elapsedMs: number): LevelResult {
  return levelResultOf({ levelId: 'fit-01', stars, moves, elapsedMs });
}

// The username of player n. The tests give each player one name (#230).
function username(n: number): Username {
  return valueOf(Username.create(`player${n}`));
}

function entry(n: number, result: LevelResult): LeaderboardEntry<LevelResult> {
  return { userId: player(n), username: username(n), result };
}

// Test double for the LevelBoardReader port. It gives the rows in the order
// of the test, as the port gives them in no order, and records each call.
// It has no highScores() and no standings(): the board of a level does not
// depend on the global boards (#218).
function readerOf(rows: LeaderboardEntry<LevelResult>[] = []) {
  return {
    levelResults: vi.fn<LevelBoardReader['levelResults']>(() => Promise.resolve(rows)),
  } satisfies LevelBoardReader;
}

// The level definitions of the tests: they hold fit-01 of Fit, the level
// of every board below.
async function storedLevels(): Promise<InMemoryLevelRepository> {
  const levels = new InMemoryLevelRepository(levelValidators());
  await storeLevel(levels, levelJson('hexa-fit', 'fit-01'));
  return levels;
}

async function useCaseOf(reader: LevelBoardReader): Promise<GetLevelLeaderboardUseCase> {
  return new GetLevelLeaderboardUseCase(reader, await storedLevels());
}

// API-FR-03. The reader only filters. The domain ranks the board: the use
// case builds RankedBoard.of() with the rows of the reader and orders
// nothing (decision of #83). The RankedBoard spec pins the order and the
// shared rank of the board.
describe('GetLevelLeaderboardUseCase (API-FR-03)', () => {
  // The use case asks the reader for the board of the level of the query,
  // and the board that it answers holds the rows that the reader gave,
  // ranked by the domain. Two entries with different stars pin that the
  // board is ranked, not raw.
  it('should_rank_the_level_board_through_the_domain_when_the_reader_gives_entries_in_no_order', async () => {
    const reader = readerOf([
      entry(4, levelResult(2, 10, 40_000)),
      entry(2, levelResult(3, 10, 40_000)),
    ]);

    const result = await (await useCaseOf(reader)).execute(QUERY);

    expect(result).toEqual({
      ok: true,
      value: {
        gameId: FIT,
        levelId: LEVEL,
        entries: RankedBoard.of([
          { userId: player(2), username: username(2), result: levelResult(3, 10, 40_000) },
          { userId: player(4), username: username(4), result: levelResult(2, 10, 40_000) },
        ]),
      },
    });
    expect(reader.levelResults).toHaveBeenCalledExactlyOnceWith(FIT, LEVEL);
  });

  // A board lists only the players who have a result to rank (decision of
  // #82). An empty board is a board, not a failure.
  it('should_give_an_empty_board_and_succeed_when_the_reader_has_no_entries', async () => {
    const result = await (await useCaseOf(readerOf())).execute(QUERY);

    expect(result).toEqual({
      ok: true,
      value: { gameId: FIT, levelId: LEVEL, entries: RankedBoard.of([]) },
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
      const reader = readerOf([entry(1, levelResult(3, 10, 40_000))]);

      const result = await (
        await useCaseOf(reader)
      ).execute({
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

    const result = await new GetLevelLeaderboardUseCase(readerOf(), levels).execute(QUERY);

    expect(result).toEqual({
      ok: true,
      value: { gameId: FIT, levelId: LEVEL, entries: RankedBoard.of([]) },
    });
  });

  // #193: the use case depends only on the LevelHolder role of the level
  // repository. A double of holds() alone serves it. The use case asks it
  // once, with the gameId and the levelId of the query.
  it('should_ask_holds_once_with_the_level_of_the_query_when_the_level_store_plays_only_the_level_holder_role', async () => {
    const holder = {
      holds: vi.fn<LevelHolder['holds']>(() => Promise.resolve(true)),
    } satisfies LevelHolder;

    const result = await new GetLevelLeaderboardUseCase(readerOf(), holder).execute(QUERY);

    expect(result).toEqual({
      ok: true,
      value: { gameId: FIT, levelId: LEVEL, entries: RankedBoard.of([]) },
    });
    expect(holder.holds).toHaveBeenCalledExactlyOnceWith(FIT, LEVEL);
  });

  // GetLevelLeaderboard binds UseCase, so LoggingAspect wraps it under its
  // own name (decisions 7 and 10). The use case holds no logging code.
  it('should_log_get_level_leaderboard_success_and_return_the_board_unchanged_when_logging_aspect_wraps_it', async () => {
    const logger = { log: vi.fn<(entry: UseCaseLogEntry) => void>() } satisfies Logger;
    const reader = readerOf([entry(1, levelResult(3, 10, 40_000))]);
    const aspect = new LoggingAspect(
      await useCaseOf(reader),
      'GetLevelLeaderboard',
      logger,
      new FakeStopwatch(),
    );

    const result = await aspect.execute(QUERY);

    expect(result).toEqual({
      ok: true,
      value: {
        gameId: FIT,
        levelId: LEVEL,
        entries: RankedBoard.of([
          { userId: player(1), username: username(1), result: levelResult(3, 10, 40_000) },
        ]),
      },
    });
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'GetLevelLeaderboard',
      outcome: 'success',
      elapsedMs: 0,
    });
  });

  // LoggingAspect logs the kind of the failure and returns it unchanged.
  it('should_log_the_unknown_level_failure_when_logging_aspect_wraps_get_level_leaderboard', async () => {
    const logger = { log: vi.fn<(entry: UseCaseLogEntry) => void>() } satisfies Logger;
    const aspect = new LoggingAspect(
      await useCaseOf(readerOf()),
      'GetLevelLeaderboard',
      logger,
      new FakeStopwatch(),
    );

    const result = await aspect.execute({ gameId: FIT, levelId: valueOf(LevelId.of('fit-99')) });

    expect(result).toEqual({ ok: false, error: { kind: 'unknown-level' } });
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'GetLevelLeaderboard',
      outcome: 'failure',
      kind: 'unknown-level',
      elapsedMs: 0,
    });
  });
});
