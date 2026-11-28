import type { GameId } from '../../domain/shared/game-id.js';
import { RankedBoard } from '../../domain/progress/ranked-board.js';
import type { Score } from '../../domain/progress/score.js';
import type { Standing } from '../../domain/progress/standing.js';
import { ok, type Result } from '../../domain/shared/result.js';
import type { GlobalBoardReader } from '../ports/global-board-reader.js';
import type { UseCase } from '../use-case.js';

// The two global boards of a game, ranked by the domain. The score board
// ranks by Score and the standing board ranks by Standing (S3-03). GameId is
// open (decision 5), so the use case reads both boards. A board lists only
// the players who have a result to rank, so the score board of Fit is empty
// (decision of #82).
export interface GlobalLeaderboard {
  readonly gameId: GameId;
  readonly highScores: RankedBoard<Score>;
  readonly standings: RankedBoard<Standing>;
}

// Input port of the global leaderboard read (API-FR-03). Its request is the
// GameId that the mapper of the border builds. Any gameId has a global board
// (decision 5), so the read has no expected failure: its error type is
// never. It binds UseCase, so one aspect can wrap it (decision 7).
export type GetGlobalLeaderboard = UseCase<GameId, Result<GlobalLeaderboard, never>>;

export const GET_GLOBAL_LEADERBOARD = Symbol('GetGlobalLeaderboard');

// Reads both global boards of a game through the GlobalBoardReader port,
// which only filters and sums. The domain ranks each board: the use case
// builds RankedBoard.of() with the rows that the reader gives and orders
// nothing (classes.md decision 2). It reads no Clock and saves nothing.
export class GetGlobalLeaderboardUseCase implements GetGlobalLeaderboard {
  constructor(private readonly boards: GlobalBoardReader) {}

  async execute(gameId: GameId): Promise<Result<GlobalLeaderboard, never>> {
    const [highScores, standings] = await Promise.all([
      this.boards.highScores(gameId),
      this.boards.standings(gameId),
    ]);
    return ok({
      gameId,
      highScores: RankedBoard.of(highScores),
      standings: RankedBoard.of(standings),
    });
  }
}
