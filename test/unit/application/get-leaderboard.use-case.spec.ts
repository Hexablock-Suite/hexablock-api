import { LoggingAspect } from '../../../src/application/aspects/logging-aspect.js';
import {
  GetLeaderboardUseCase,
  type Leaderboard,
} from '../../../src/application/leaderboard/get-leaderboard.use-case.js';
import type { LeaderboardEntry } from '../../../src/application/ports/leaderboard-entry.js';
import type { LeaderboardReader } from '../../../src/application/ports/leaderboard-reader.js';
import type { Logger, UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import { ElapsedTime } from '../../../src/domain/progress/elapsed-time.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import type { LevelResult } from '../../../src/domain/progress/level-result.js';
import { LevelsCompleted } from '../../../src/domain/progress/levels-completed.js';
import { Moves } from '../../../src/domain/progress/moves.js';
import { Score } from '../../../src/domain/progress/score.js';
import { Standing } from '../../../src/domain/progress/standing.js';
import { Stars } from '../../../src/domain/progress/stars.js';
import type { Result } from '../../../src/domain/shared/result.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { levelResultOf } from '../../support/level-results.js';
import { testUserId } from '../../support/user-ids.js';
import { valueOf } from '../../support/result.js';

const FIT = valueOf(GameId.of('hexa-fit'));
const LINES = valueOf(GameId.of('hexa-lines'));
const LEVEL = valueOf(LevelId.of('fit-01'));

function created<T>(result: Result<T, string>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function player(n: number): UserId {
  return valueOf(UserId.from(testUserId(n)));
}

function levelResult(stars: number, moves: number, elapsedMs: number): LevelResult {
  return levelResultOf({ levelId: 'fit-01', stars, moves, elapsedMs });
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

function entry<TResult>(n: number, result: TResult): LeaderboardEntry<TResult> {
  return { userId: player(n), result };
}

function ranked<TResult>(rank: number, from: LeaderboardEntry<TResult>) {
  return { rank, userId: from.userId, result: from.result };
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

async function boardOf(
  reader: LeaderboardReader,
  query: Parameters<GetLeaderboardUseCase['execute']>[0],
): Promise<Leaderboard> {
  const result = await new GetLeaderboardUseCase(reader).execute(query);
  if (!result.ok) throw new Error('GetLeaderboard has no expected failure.');
  return result.value;
}

// API-FR-03. The reader only filters and sums. The use case orders each board
// with the comparison of the domain and gives each row its rank (decision of #83).
describe('GetLeaderboardUseCase (API-FR-03)', () => {
  // The use case orders the board with LevelResult.isBetterThan(). The
  // LevelResult spec pins each step of DS-4, so these entries differ only in
  // stars. The userId order differs from the board order, so the tie order
  // cannot make the test pass.
  it('should_order_the_level_board_by_the_level_result_comparison_when_the_reader_gives_entries_in_no_order', async () => {
    const threeStars = entry(2, levelResult(3, 10, 40_000));
    const twoStars = entry(4, levelResult(2, 10, 40_000));
    const oneStar = entry(1, levelResult(1, 10, 40_000));
    const noStars = entry(3, levelResult(0, 10, 40_000));
    const reader = readerOf({ levelResults: [twoStars, noStars, oneStar, threeStars] });

    const board = await boardOf(reader, { board: 'level', gameId: FIT, levelId: LEVEL });

    expect(board).toEqual({
      board: 'level',
      gameId: FIT,
      levelId: LEVEL,
      entries: [ranked(1, threeStars), ranked(2, twoStars), ranked(3, oneStar), ranked(4, noStars)],
    });
    expect(reader.levelResults).toHaveBeenCalledExactlyOnceWith(FIT, LEVEL);
    expect(reader.highScores).not.toHaveBeenCalled();
    expect(reader.standings).not.toHaveBeenCalled();
  });

  // The global board of Lines and Merge: the higher score wins (S3-03).
  it('should_order_the_high_scores_by_the_higher_score_when_the_reader_gives_entries_in_no_order', async () => {
    const low = entry(1, valueOf(Score.of(80)));
    const high = entry(2, valueOf(Score.of(2048)));
    const middle = entry(3, valueOf(Score.of(120)));
    const reader = readerOf({ highScores: [low, high, middle] });

    const board = await boardOf(reader, { board: 'global', gameId: LINES });

    expect(board).toEqual({
      board: 'global',
      gameId: LINES,
      highScores: [ranked(1, high), ranked(2, middle), ranked(3, low)],
      standings: [],
    });
    expect(reader.highScores).toHaveBeenCalledExactlyOnceWith(LINES);
    expect(reader.standings).toHaveBeenCalledExactlyOnceWith(LINES);
    expect(reader.levelResults).not.toHaveBeenCalled();
  });

  // The global board of Fit and Sort: more stars, then more levels completed,
  // then fewer moves, then less time (S3-03).
  it('should_order_the_standings_by_stars_then_levels_then_moves_then_time_when_the_reader_gives_entries_in_no_order', async () => {
    const lessTime = entry(1, standing(9, 3, 40, 90_000));
    const moreTime = entry(2, standing(9, 3, 40, 95_000));
    const moreMoves = entry(3, standing(9, 3, 41, 10_000));
    const fewerLevels = entry(4, standing(9, 2, 20, 10_000));
    const fewerStars = entry(5, standing(8, 4, 10, 10_000));
    const reader = readerOf({
      standings: [fewerLevels, moreMoves, fewerStars, lessTime, moreTime],
    });

    const board = await boardOf(reader, { board: 'global', gameId: FIT });

    expect(board).toEqual({
      board: 'global',
      gameId: FIT,
      highScores: [],
      standings: [
        ranked(1, lessTime),
        ranked(2, moreTime),
        ranked(3, moreMoves),
        ranked(4, fewerLevels),
        ranked(5, fewerStars),
      ],
    });
  });

  // S3-03: a full tie ranks neither player first. The tied rows share a
  // rank, and the next rank skips: 1, 1, 3.
  it('should_share_a_rank_and_skip_the_next_rank_when_two_entries_tie_fully', async () => {
    const levelTieA = entry(1, levelResult(3, 10, 40_000));
    const levelTieB = entry(2, levelResult(3, 10, 40_000));
    const levelLast = entry(3, levelResult(1, 10, 40_000));
    const scoreTieA = entry(1, valueOf(Score.of(120)));
    const scoreTieB = entry(2, valueOf(Score.of(120)));
    const scoreLast = entry(3, valueOf(Score.of(80)));
    const standingFirst = entry(1, standing(9, 3, 40, 90_000));
    const standingTieA = entry(2, standing(5, 2, 20, 50_000));
    const standingTieB = entry(3, standing(5, 2, 20, 50_000));
    const reader = readerOf({
      levelResults: [levelLast, levelTieB, levelTieA],
      highScores: [scoreLast, scoreTieB, scoreTieA],
      standings: [standingTieB, standingTieA, standingFirst],
    });

    const levelBoard = await boardOf(reader, { board: 'level', gameId: FIT, levelId: LEVEL });
    const globalBoard = await boardOf(reader, { board: 'global', gameId: FIT });

    expect(levelBoard).toEqual({
      board: 'level',
      gameId: FIT,
      levelId: LEVEL,
      entries: [ranked(1, levelTieA), ranked(1, levelTieB), ranked(3, levelLast)],
    });
    expect(globalBoard).toEqual({
      board: 'global',
      gameId: FIT,
      highScores: [ranked(1, scoreTieA), ranked(1, scoreTieB), ranked(3, scoreLast)],
      standings: [ranked(1, standingFirst), ranked(2, standingTieA), ranked(2, standingTieB)],
    });
  });

  // Equal entries come out in one fixed order: userId ascending.
  it('should_list_full_ties_by_user_id_ascending_when_the_reader_gives_them_in_another_order', async () => {
    const tied = [4, 2, 3, 1].map((n) => entry(n, valueOf(Score.of(500))));
    const reader = readerOf({ highScores: tied });

    const board = await boardOf(reader, { board: 'global', gameId: LINES });

    expect(board).toEqual({
      board: 'global',
      gameId: LINES,
      highScores: [tied[3], tied[1], tied[2], tied[0]].map((tie) => ranked(1, tie)),
      standings: [],
    });
  });

  // A board lists only the players who have a result to rank (decision of
  // #82). An empty board is a board, not a failure.
  it('should_give_empty_boards_and_succeed_when_the_reader_has_no_entries', async () => {
    const reader = readerOf({});

    const levelResult = await new GetLeaderboardUseCase(reader).execute({
      board: 'level',
      gameId: FIT,
      levelId: LEVEL,
    });
    const globalResult = await new GetLeaderboardUseCase(reader).execute({
      board: 'global',
      gameId: FIT,
    });

    expect(levelResult).toEqual({
      ok: true,
      value: { board: 'level', gameId: FIT, levelId: LEVEL, entries: [] },
    });
    expect(globalResult).toEqual({
      ok: true,
      value: { board: 'global', gameId: FIT, highScores: [], standings: [] },
    });
  });

  // GetLeaderboard binds UseCase, so LoggingAspect wraps it. The use case
  // holds no logging code (decision 7).
  it('should_log_get_leaderboard_success_and_return_the_board_unchanged_when_logging_aspect_wraps_it', async () => {
    const score = entry(1, valueOf(Score.of(120)));
    const logger = { log: vi.fn<(entry: UseCaseLogEntry) => void>() } satisfies Logger;
    const inner = new GetLeaderboardUseCase(readerOf({ highScores: [score] }));
    const aspect = new LoggingAspect(inner, 'GetLeaderboard', logger);

    const result = await aspect.execute({ board: 'global', gameId: LINES });

    expect(result).toEqual({
      ok: true,
      value: { board: 'global', gameId: LINES, highScores: [ranked(1, score)], standings: [] },
    });
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'GetLeaderboard',
      outcome: 'success',
    });
  });
});
