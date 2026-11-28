import { GameId } from '../../domain/shared/game-id.js';
import { PlayerProgress } from '../../domain/progress/player-progress.js';
import { ProgressKey } from '../../domain/progress/progress-key.js';
import { Score } from '../../domain/progress/score.js';
import { SyncInstant } from '../../domain/progress/sync-instant.js';
import { UserId } from '../../domain/shared/user-id.js';
import { buildLevelResult } from '../built.js';
import { receiveProgressOf } from '../received.js';
import type { levelResults, progress } from './schema.js';
import { storedValue } from './stored-value.js';

export type ProgressRow = typeof progress.$inferSelect;
export type LevelResultRow = typeof levelResults.$inferSelect;

// Splits the PlayerProgress aggregate into its progress row and its
// level_results rows, and joins them back (classes.md decision 2).
export const ProgressRowMapper = {
  // The mapper builds the value objects of the row and of each stored result,
  // joins the UserId and the GameId in the ProgressKey, and restore() takes
  // them in the order of PlayerProgressReceiver. The updated_at column gives
  // a Date, and its milliseconds build the SyncInstant. A stored value that breaks its rule is a server fault, so
  // the mapper throws. Postgres keeps 'infinity', for example: it reads as an
  // invalid Date, and SyncInstant.of() rejects it.
  toAggregate(row: ProgressRow, resultRows: readonly LevelResultRow[]): PlayerProgress {
    const rows = `The progress rows of user ${row.userId} and game ${row.gameId}`;
    const userId = storedValue(UserId.from(row.userId), rows);
    const gameId = storedValue(GameId.of(row.gameId), rows);
    const highScore = row.highScore === null ? null : storedValue(Score.of(row.highScore), rows);
    const updatedAt = storedValue(SyncInstant.of(row.updatedAt.getTime()), rows);
    const results = resultRows.map((result) => storedValue(buildLevelResult(result), rows));
    const key = ProgressKey.of(userId, gameId);
    return PlayerProgress.restore(key, highScore, updatedAt, results);
  },

  // The aggregate delivers its parts to the mapper. The mapper receives the
  // value that each value object delivers, and the two values of the key.
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
