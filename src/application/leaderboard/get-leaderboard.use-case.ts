import type { GameId } from '../../domain/progress/game-id.js';
import type { LevelId } from '../../domain/progress/level-id.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import type { Score } from '../../domain/progress/score.js';
import type { Standing } from '../../domain/progress/standing.js';
import { ok, type Result } from '../../domain/shared/result.js';
import type { UseCase } from '../use-case.js';
import type { LeaderboardEntry } from '../ports/leaderboard-entry.js';
import type { LeaderboardReader } from '../ports/leaderboard-reader.js';

// The input of GetLeaderboard. The global query asks for both global boards
// of a game. The level query asks for the board of one level of a game. The
// mapper of the border builds the GameId and the LevelId.
export type LeaderboardQuery =
  | { readonly board: 'global'; readonly gameId: GameId }
  | { readonly board: 'level'; readonly gameId: GameId; readonly levelId: LevelId };

// One row of a board with its rank. The rank is 1 plus the number of entries
// of the board that are strictly better. So a full tie shares a rank, and the
// next rank skips: 1, 1, 3 (decision of #83).
export interface RankedEntry<TResult> extends LeaderboardEntry<TResult> {
  readonly rank: number;
}

// The two global boards of a game. The score board ranks by Score and the
// standing board ranks by Standing (S3-03). GameId is open (decision 5), so
// the use case reads both boards. A board lists only the players who have a
// result to rank, so the score board of Fit is empty (decision of #82).
export interface GlobalLeaderboard {
  readonly board: 'global';
  readonly gameId: GameId;
  readonly highScores: RankedEntry<Score>[];
  readonly standings: RankedEntry<Standing>[];
}

// The board of one level of a game, ranked by LevelResult (DS-4).
export interface LevelLeaderboard {
  readonly board: 'level';
  readonly gameId: GameId;
  readonly levelId: LevelId;
  readonly entries: RankedEntry<LevelResult>[];
}

export type Leaderboard = GlobalLeaderboard | LevelLeaderboard;

// Input port of the leaderboard read (API-FR-03). It binds UseCase, so one
// aspect can wrap it (decision 7). It has no expected failure, so its error
// type is never: LoggingAspect always logs a success or a thrown error.
export type GetLeaderboard = UseCase<LeaderboardQuery, Result<Leaderboard, never>>;

export const GET_LEADERBOARD = Symbol('GetLeaderboard');

// Reads the entries of a board through the LeaderboardReader port, which
// only filters and sums. The use case orders the entries with the comparison
// of the domain and gives each one its rank (classes.md decision 2). It
// reads no Clock and saves nothing.
export class GetLeaderboardUseCase implements GetLeaderboard {
  constructor(private readonly leaderboard: LeaderboardReader) {}

  async execute(query: LeaderboardQuery): Promise<Result<Leaderboard, never>> {
    const { gameId } = query;
    if (query.board === 'level') {
      const entries = await this.leaderboard.levelResults(gameId, query.levelId);
      return ok({
        board: 'level',
        gameId,
        levelId: query.levelId,
        entries: ranked(entries, (one, other) => one.isBetterThan(other)),
      });
    }
    const [highScores, standings] = await Promise.all([
      this.leaderboard.highScores(gameId),
      this.leaderboard.standings(gameId),
    ]);
    return ok({
      board: 'global',
      gameId,
      highScores: ranked(highScores, (one, other) => one.isHigherThan(other)),
      standings: ranked(standings, (one, other) => one.isBetterThan(other)),
    });
  }
}

// Orders the entries with the comparison of the domain. When neither entry
// beats the other, the tie is full, and the entries come out by userId
// ascending, so the board has one fixed order. In the ordered list, the
// tied entries stand next to each other. So an entry that its predecessor
// does not beat shares the rank of that predecessor. Any other entry has
// every predecessor above it, and its rank is its position.
function ranked<TResult>(
  entries: readonly LeaderboardEntry<TResult>[],
  beats: (one: TResult, other: TResult) => boolean,
): RankedEntry<TResult>[] {
  const ordered = entries.toSorted((one, other) => {
    if (beats(one.result, other.result)) return -1;
    if (beats(other.result, one.result)) return 1;
    if (one.userId.comesBefore(other.userId)) return -1;
    return other.userId.comesBefore(one.userId) ? 1 : 0;
  });
  const board: RankedEntry<TResult>[] = [];
  for (const [index, { userId, result }] of ordered.entries()) {
    const previous = board.at(-1);
    const rank =
      previous !== undefined && !beats(previous.result, result) ? previous.rank : index + 1;
    board.push({ rank, userId, result });
  }
  return board;
}
