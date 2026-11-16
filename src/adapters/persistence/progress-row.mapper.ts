import { GameId } from '../../domain/progress/game-id.js';
import { PlayerProgress } from '../../domain/progress/player-progress.js';
import { Score } from '../../domain/progress/score.js';
import { UserId } from '../../domain/user/user-id.js';
import { buildLevelResult } from '../built.js';
import { receiveProgressOf } from '../received.js';
import type { levelResults, progress } from './schema.js';
import { storedValue } from './stored-value.js';

export type ProgressRow = typeof progress.$inferSelect;
export type LevelResultRow = typeof levelResults.$inferSelect;

// Splits the PlayerProgress aggregate into its progress row and its
// level_results rows, and joins them back (classes.md decision 2).
export const ProgressRowMapper = {
  // The mapper builds the value objects of the row and of each stored result.
  // start() takes the key and the instant, and restore() records the rest. A
  // stored value that breaks its rule is a server fault, so the mapper throws.
  toAggregate(row: ProgressRow, resultRows: readonly LevelResultRow[]): PlayerProgress {
    const rows = `The progress rows of user ${row.userId} and game ${row.gameId}`;
    const userId = storedValue(UserId.from(row.userId), rows);
    const gameId = storedValue(GameId.of(row.gameId), rows);
    const highScore = row.highScore === null ? null : storedValue(Score.of(row.highScore), rows);
    const results = resultRows.map((result) => storedValue(buildLevelResult(result), rows));
    return PlayerProgress.restore(
      PlayerProgress.start(userId, gameId, row.updatedAt),
      highScore,
      results,
    );
  },

  // The aggregate delivers its parts to the mapper. The mapper receives the
  // value that each value object delivers.
  toProgressRow(aggregate: PlayerProgress): ProgressRow {
    const { userId, gameId, highScore, updatedAt } = receiveProgressOf(aggregate);
    // The high_score column keeps a number.
    return { userId, gameId, highScore, updatedAt };
  },

  // The level_results columns keep a text and three numbers. Each
  // LevelResult delivers its four values in one call.
  toLevelResultRows(aggregate: PlayerProgress): LevelResultRow[] {
    const { userId, gameId, results } = receiveProgressOf(aggregate);
    return results.map((result) => ({ userId, gameId, ...result }));
  },
};
