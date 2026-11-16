import type { GameId } from '../../domain/progress/game-id.js';
import type { LevelId } from '../../domain/progress/level-id.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import type { Score } from '../../domain/progress/score.js';
import type { Standing } from '../../domain/progress/standing.js';
import type { LeaderboardEntry } from './leaderboard-entry.js';

// Port. It reads the rows of the leaderboards of one game (API-FR-03). It
// only filters and sums. It gives the entries in no order: the use case
// orders them with the comparisons of the domain (classes.md decision 2). It
// names no table and no library type.
export interface LeaderboardReader {
  // The board of one level of a game: the stored result of each player for
  // that level. The progress keeps the best result of a level (DS-12).
  levelResults(gameId: GameId, levelId: LevelId): Promise<LeaderboardEntry<LevelResult>[]>;

  // The global board of Lines and Merge: the high score of each player of the
  // game who has one.
  highScores(gameId: GameId): Promise<LeaderboardEntry<Score>[]>;

  // The global board of Fit and Sort: the totals of the stored results of
  // each player of the game who completed at least one level (S3-03).
  standings(gameId: GameId): Promise<LeaderboardEntry<Standing>[]>;
}
