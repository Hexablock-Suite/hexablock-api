import { LoggingAspect } from '../../../src/application/aspects/logging-aspect.js';
import { GetGlobalLeaderboardUseCase } from '../../../src/application/leaderboard/get-global-leaderboard.use-case.js';
import type { GlobalBoardReader } from '../../../src/application/ports/global-board-reader.js';
import type { LeaderboardEntry } from '../../../src/application/ports/leaderboard-entry.js';
import type { Logger, UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import { ElapsedTime } from '../../../src/domain/progress/elapsed-time.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelsCompleted } from '../../../src/domain/progress/levels-completed.js';
import { Moves } from '../../../src/domain/progress/moves.js';
import { RankedBoard } from '../../../src/domain/progress/ranked-board.js';
import { Score } from '../../../src/domain/progress/score.js';
import { Standing } from '../../../src/domain/progress/standing.js';
import { Stars } from '../../../src/domain/progress/stars.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { Username } from '../../../src/domain/user/username.js';
import { testUserId } from '../../support/user-ids.js';
import { valueOf } from '../../support/result.js';

const FIT = valueOf(GameId.of('hexa-fit'));
const LINES = valueOf(GameId.of('hexa-lines'));

function player(n: number): UserId {
  return valueOf(UserId.from(testUserId(n)));
}

// The username of player n. The tests give each player one name (#230).
function username(n: number): Username {
  return valueOf(Username.create(`player${n}`));
}

function entry<TResult>(n: number, result: TResult): LeaderboardEntry<TResult> {
  return { userId: player(n), username: username(n), result };
}

function standing(stars: number, levels: number): Standing {
  return valueOf(
    Standing.of(
      valueOf(Stars.of(stars)),
      valueOf(LevelsCompleted.of(levels)),
      valueOf(Moves.of(10)),
      valueOf(ElapsedTime.ofMs(40_000)),
    ),
  );
}

interface Rows {
  readonly highScores?: LeaderboardEntry<Score>[];
  readonly standings?: LeaderboardEntry<Standing>[];
}

// Test double for the GlobalBoardReader port. It gives the rows in the order
// of the test, as the port gives them in no order, and records each call.
// It has no levelResults(): the global board does not depend on the board of
// a level (#218).
function readerOf(rows: Rows) {
  return {
    highScores: vi.fn<GlobalBoardReader['highScores']>(() =>
      Promise.resolve(rows.highScores ?? []),
    ),
    standings: vi.fn<GlobalBoardReader['standings']>(() => Promise.resolve(rows.standings ?? [])),
  } satisfies GlobalBoardReader;
}

// API-FR-03. The reader only filters and sums. The domain ranks each board:
// the use case builds RankedBoard.of() with the rows of the reader and
// orders nothing (decision of #83). The RankedBoard spec pins the order and
// the shared rank of the board.
describe('GetGlobalLeaderboardUseCase (API-FR-03)', () => {
  // The use case reads both global boards of the game through the reader
  // and ranks them through the domain (S3-03). Two entries of each board in
  // the wrong order pin that each board is ranked, not raw.
  it('should_rank_both_global_boards_through_the_domain_when_the_reader_gives_entries_in_no_order', async () => {
    const reader = readerOf({
      highScores: [entry(1, valueOf(Score.of(80))), entry(2, valueOf(Score.of(2048)))],
      standings: [entry(3, standing(2, 1)), entry(4, standing(5, 2))],
    });

    const result = await new GetGlobalLeaderboardUseCase(reader).execute(LINES);

    expect(result).toEqual({
      ok: true,
      value: {
        gameId: LINES,
        highScores: RankedBoard.of([
          { userId: player(2), username: username(2), result: valueOf(Score.of(2048)) },
          { userId: player(1), username: username(1), result: valueOf(Score.of(80)) },
        ]),
        standings: RankedBoard.of([
          { userId: player(4), username: username(4), result: standing(5, 2) },
          { userId: player(3), username: username(3), result: standing(2, 1) },
        ]),
      },
    });
    expect(reader.highScores).toHaveBeenCalledExactlyOnceWith(LINES);
    expect(reader.standings).toHaveBeenCalledExactlyOnceWith(LINES);
  });

  // A board lists only the players who have a result to rank (decision of
  // #82). An empty board is a board, not a failure. Any gameId has a global
  // board (decision 5), so the read never fails.
  it('should_give_empty_global_boards_and_succeed_when_the_reader_has_no_entries', async () => {
    const result = await new GetGlobalLeaderboardUseCase(readerOf({})).execute(FIT);

    expect(result).toEqual({
      ok: true,
      value: { gameId: FIT, highScores: RankedBoard.of([]), standings: RankedBoard.of([]) },
    });
  });

  // GetGlobalLeaderboard binds UseCase, so LoggingAspect wraps it under its
  // own name (decisions 7 and 10). The use case holds no logging code.
  it('should_log_get_global_leaderboard_success_and_return_the_board_unchanged_when_logging_aspect_wraps_it', async () => {
    const logger = { log: vi.fn<(entry: UseCaseLogEntry) => void>() } satisfies Logger;
    const inner = new GetGlobalLeaderboardUseCase(
      readerOf({ highScores: [entry(1, valueOf(Score.of(120)))] }),
    );
    const aspect = new LoggingAspect(inner, 'GetGlobalLeaderboard', logger);

    const result = await aspect.execute(LINES);

    expect(result).toEqual({
      ok: true,
      value: {
        gameId: LINES,
        highScores: RankedBoard.of([
          { userId: player(1), username: username(1), result: valueOf(Score.of(120)) },
        ]),
        standings: RankedBoard.of([]),
      },
    });
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'GetGlobalLeaderboard',
      outcome: 'success',
    });
  });
});
