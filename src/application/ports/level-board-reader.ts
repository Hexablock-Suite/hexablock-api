import type { GameId } from '../../domain/shared/game-id.js';
import type { LevelId } from '../../domain/shared/level-id.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import type { LeaderboardEntry } from './leaderboard-entry.js';

// Port. It reads the rows of the board of one level of a game (API-FR-03).
// It only filters. It gives the entries in no order: the use case orders
// them with the comparison of the domain (classes.md decision 2). It names
// no table and no library type. The global boards have their own port,
// GlobalBoardReader (#218).
export interface LevelBoardReader {
  // The stored result of each player for that level. The progress keeps the
  // best result of a level (DS-12).
  levelResults(gameId: GameId, levelId: LevelId): Promise<LeaderboardEntry<LevelResult>[]>;
}

// Nest injection token for the LevelBoardReader port.
export const LEVEL_BOARD_READER = Symbol('LevelBoardReader');
