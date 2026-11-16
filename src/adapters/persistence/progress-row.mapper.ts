import { ElapsedTime } from '../../domain/progress/elapsed-time.js';
import { GameId } from '../../domain/progress/game-id.js';
import { LevelId } from '../../domain/progress/level-id.js';
import { LevelResult } from '../../domain/progress/level-result.js';
import { Moves } from '../../domain/progress/moves.js';
import { PlayerProgress } from '../../domain/progress/player-progress.js';
import { Score } from '../../domain/progress/score.js';
import { Stars } from '../../domain/progress/stars.js';
import { UserId } from '../../domain/user/user-id.js';
import { receiveLevelResultOf, receiveValueOf } from '../received.js';
import type { levelResults, progress } from './schema.js';

export type ProgressRow = typeof progress.$inferSelect;
export type LevelResultRow = typeof levelResults.$inferSelect;

// Splits the PlayerProgress aggregate into its progress row and its
// level_results rows, and joins them back (classes.md decision 2).
export const ProgressRowMapper = {
  toAggregate(row: ProgressRow, resultRows: readonly LevelResultRow[]): PlayerProgress {
    return PlayerProgress.restore({
      userId: UserId.from(row.userId),
      gameId: GameId.of(row.gameId),
      highScore: row.highScore === null ? null : Score.of(row.highScore),
      updatedAt: row.updatedAt,
      // The mapper builds the four value objects of each stored result.
      results: resultRows.map(({ levelId, stars, moves, elapsedMs }) =>
        LevelResult.of(
          LevelId.of(levelId),
          Stars.of(stars),
          Moves.of(moves),
          ElapsedTime.ofMs(elapsedMs),
        ),
      ),
    });
  },

  // The mapper reads the snapshot of the aggregate, its Memento. It receives
  // the value that each value object delivers.
  toProgressRow(aggregate: PlayerProgress): ProgressRow {
    const { userId, gameId, highScore, updatedAt } = aggregate.snapshot();
    return {
      userId: receiveValueOf(userId),
      gameId: receiveValueOf(gameId),
      // The high_score column keeps a number.
      highScore: highScore === null ? null : receiveValueOf(highScore),
      updatedAt,
    };
  },

  toLevelResultRows(aggregate: PlayerProgress): LevelResultRow[] {
    const { userId, gameId, results } = aggregate.snapshot();
    // The level_results columns keep a text and three numbers. Each
    // LevelResult delivers its four values in one call.
    const userIdValue = receiveValueOf(userId);
    const gameIdValue = receiveValueOf(gameId);
    return results.map((result) => ({
      userId: userIdValue,
      gameId: gameIdValue,
      ...receiveLevelResultOf(result),
    }));
  },
};
