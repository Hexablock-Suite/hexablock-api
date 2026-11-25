import type { GameId } from '../../domain/progress/game-id.js';
import type { LevelId } from '../../domain/progress/level-id.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import { RankedBoard } from '../../domain/progress/ranked-board.js';
import type { Score } from '../../domain/progress/score.js';
import type { Standing } from '../../domain/progress/standing.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { UseCase } from '../use-case.js';
import type { LeaderboardReader } from '../ports/leaderboard-reader.js';
import type { LevelRepository } from '../ports/level-repository.js';

// The input of GetLeaderboard. The global query asks for both global boards
// of a game. The level query asks for the board of one level of a game. The
// mapper of the border builds the GameId and the LevelId.
export type LeaderboardQuery =
  | { readonly board: 'global'; readonly gameId: GameId }
  | { readonly board: 'level'; readonly gameId: GameId; readonly levelId: LevelId };

// The two global boards of a game, ranked by the domain. The score board
// ranks by Score and the standing board ranks by Standing (S3-03). GameId is
// open (decision 5), so the use case reads both boards. A board lists only
// the players who have a result to rank, so the score board of Fit is empty
// (decision of #82).
export interface GlobalLeaderboard {
  readonly board: 'global';
  readonly gameId: GameId;
  readonly highScores: RankedBoard<Score>;
  readonly standings: RankedBoard<Standing>;
}

// The board of one level of a game, ranked by LevelResult (DS-4).
export interface LevelLeaderboard {
  readonly board: 'level';
  readonly gameId: GameId;
  readonly levelId: LevelId;
  readonly entries: RankedBoard<LevelResult>;
}

export type Leaderboard = GlobalLeaderboard | LevelLeaderboard;

// The one expected failure of GetLeaderboard: the level definitions do not
// hold the level of a level query (#146). The API holds every level, so
// that level has no board. The global board of a game never fails.
export interface UnknownLevel {
  readonly kind: 'unknown-level';
}

// Input port of the leaderboard read (API-FR-03). It binds UseCase, so one
// aspect can wrap it (decision 7). LoggingAspect logs the kind of a failure.
export type GetLeaderboard = UseCase<LeaderboardQuery, Result<Leaderboard, UnknownLevel>>;

export const GET_LEADERBOARD = Symbol('GetLeaderboard');

// Reads the entries of a board through the LeaderboardReader port, which
// only filters and sums. The domain ranks the board: the use case builds
// RankedBoard.of() with the rows that the reader gives and orders nothing
// (classes.md decision 2). Before it reads the board of a level, it asks the
// LevelRepository port whether the definitions hold that level (#146). It
// reads no Clock and saves nothing.
export class GetLeaderboardUseCase implements GetLeaderboard {
  constructor(
    private readonly leaderboard: LeaderboardReader,
    private readonly levels: LevelRepository,
  ) {}

  async execute(query: LeaderboardQuery): Promise<Result<Leaderboard, UnknownLevel>> {
    const { gameId } = query;
    if (query.board === 'level') {
      if (!(await this.levels.holds(gameId, query.levelId))) {
        return err({ kind: 'unknown-level' });
      }
      const entries = await this.leaderboard.levelResults(gameId, query.levelId);
      return ok({
        board: 'level',
        gameId,
        levelId: query.levelId,
        entries: RankedBoard.of(entries),
      });
    }
    const [highScores, standings] = await Promise.all([
      this.leaderboard.highScores(gameId),
      this.leaderboard.standings(gameId),
    ]);
    return ok({
      board: 'global',
      gameId,
      highScores: RankedBoard.of(highScores),
      standings: RankedBoard.of(standings),
    });
  }
}
