import type { GameId } from '../../domain/shared/game-id.js';
import type { Score } from '../../domain/progress/score.js';
import type { Standing } from '../../domain/progress/standing.js';
import type { LeaderboardEntry } from './leaderboard-entry.js';

// Port. It reads the rows of the two global boards of one game (API-FR-03).
// It only filters and sums. It gives the entries in no order: the use case
// orders them with the comparisons of the domain (classes.md decision 2). It
// names no table and no library type. The board of one level has its own
// port, LevelBoardReader, so no client depends on a read that it does not
// use (#218).
export interface GlobalBoardReader {
  // The global board of Lines and Merge: the high score of each player of the
  // game who has one.
  highScores(gameId: GameId): Promise<LeaderboardEntry<Score>[]>;

  // The global board of Fit and Sort: the totals of the stored results of
  // each player of the game who completed at least one level (S3-03).
  standings(gameId: GameId): Promise<LeaderboardEntry<Standing>[]>;
}

// Nest injection token for the GlobalBoardReader port.
export const GLOBAL_BOARD_READER = Symbol('GlobalBoardReader');
