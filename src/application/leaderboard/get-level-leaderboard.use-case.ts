import type { GameId } from '../../domain/shared/game-id.js';
import type { LevelId } from '../../domain/shared/level-id.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import { RankedBoard } from '../../domain/progress/ranked-board.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { LevelBoardReader } from '../ports/level-board-reader.js';
import type { LevelHolder } from '../ports/level-repository.js';
import type { UseCase } from '../use-case.js';

// The input of GetLevelLeaderboard: one level of a game. The mapper of the
// border builds the GameId and the LevelId.
export interface LevelBoardQuery {
  readonly gameId: GameId;
  readonly levelId: LevelId;
}

// The board of one level of a game, ranked by LevelResult (DS-4).
export interface LevelLeaderboard {
  readonly gameId: GameId;
  readonly levelId: LevelId;
  readonly entries: RankedBoard<LevelResult>;
}

// The one expected failure of GetLevelLeaderboard: the level definitions do
// not hold the level of the query (#146). The API holds every level, so
// that level has no board.
export interface UnknownLevel {
  readonly kind: 'unknown-level';
}

// Input port of the read of the board of one level (API-FR-03). It binds
// UseCase, so one aspect can wrap it (decision 7). LoggingAspect logs the
// kind of a failure.
export type GetLevelLeaderboard = UseCase<LevelBoardQuery, Result<LevelLeaderboard, UnknownLevel>>;

export const GET_LEVEL_LEADERBOARD = Symbol('GetLevelLeaderboard');

// Reads the board of one level through the LevelBoardReader port, which only
// filters. The domain ranks the board: the use case builds RankedBoard.of()
// with the rows that the reader gives and orders nothing (classes.md
// decision 2). Before it reads the board, it asks the LevelRepository port
// whether the definitions hold that level (#146). It holds only the
// LevelHolder role of that port (decision 23, #193). It reads no Clock and
// saves nothing.
export class GetLevelLeaderboardUseCase implements GetLevelLeaderboard {
  constructor(
    private readonly boards: LevelBoardReader,
    private readonly levels: LevelHolder,
  ) {}

  async execute(query: LevelBoardQuery): Promise<Result<LevelLeaderboard, UnknownLevel>> {
    const { gameId, levelId } = query;
    if (!(await this.levels.holds(gameId, levelId))) {
      return err({ kind: 'unknown-level' });
    }
    const entries = await this.boards.levelResults(gameId, levelId);
    return ok({ gameId, levelId, entries: RankedBoard.of(entries) });
  }
}
