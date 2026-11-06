import { GameId } from '../../domain/progress/game-id.js';
import { LevelResult } from '../../domain/progress/level-result.js';
import { PlayerProgress } from '../../domain/progress/player-progress.js';
import { UserId } from '../../domain/user/user-id.js';
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
      highScore: row.highScore,
      updatedAt: row.updatedAt,
      results: resultRows.map(({ levelId, stars, moves, elapsedMs }) =>
        LevelResult.of({ levelId, stars, moves, elapsedMs }),
      ),
    });
  },

  toProgressRow(aggregate: PlayerProgress): ProgressRow {
    return {
      userId: aggregate.userId.value,
      gameId: aggregate.gameId.value,
      highScore: aggregate.highScore,
      updatedAt: aggregate.updatedAt,
    };
  },

  toLevelResultRows(aggregate: PlayerProgress): LevelResultRow[] {
    return aggregate.results.map((result) => ({
      userId: aggregate.userId.value,
      gameId: aggregate.gameId.value,
      levelId: result.levelId,
      stars: result.stars,
      moves: result.moves,
      elapsedMs: result.elapsedMs,
    }));
  },
};
