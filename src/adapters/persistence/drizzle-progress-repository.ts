import { and, asc, eq, sql } from 'drizzle-orm';
import type { ProgressRepository } from '../../application/ports/progress-repository.js';
import type { GameId } from '../../domain/progress/game-id.js';
import type { PlayerProgress } from '../../domain/progress/player-progress.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { PersistenceDatabase } from './drizzle-user-repository.js';
import { ProgressRowMapper } from './progress-row.mapper.js';
import { levelResults, progress } from './schema.js';

// Adapter of the ProgressRepository port over the progress and level_results
// tables of DS-5 (API-FR-02). It saves the whole aggregate in one transaction.
export class DrizzleProgressRepository implements ProgressRepository {
  constructor(private readonly db: PersistenceDatabase) {}

  async find(userId: UserId, gameId: GameId): Promise<PlayerProgress | null> {
    const [row] = await this.db
      .select()
      .from(progress)
      .where(and(eq(progress.userId, userId.value), eq(progress.gameId, gameId.value)))
      .limit(1);
    if (row === undefined) {
      return null;
    }
    // The tables keep no record order, so the results come back by levelId.
    const resultRows = await this.db
      .select()
      .from(levelResults)
      .where(and(eq(levelResults.userId, row.userId), eq(levelResults.gameId, row.gameId)))
      .orderBy(asc(levelResults.levelId));
    return ProgressRowMapper.toAggregate(row, resultRows);
  }

  // The primary key on userId and gameId keeps one progress row: a second
  // save updates it. The update keeps the higher of the stored and the new
  // high_score, so a save from a stale read does not lower it (API-FR-02).
  // greatest() ignores a null. The level_results rows of the key are
  // written again. The foreign key to users.id rejects an unknown user.
  async save(aggregate: PlayerProgress): Promise<void> {
    const row = ProgressRowMapper.toProgressRow(aggregate);
    const resultRows = ProgressRowMapper.toLevelResultRows(aggregate);
    await this.db.transaction(async (tx) => {
      await tx
        .insert(progress)
        .values(row)
        .onConflictDoUpdate({
          target: [progress.userId, progress.gameId],
          set: {
            highScore: sql`greatest(${progress.highScore}, excluded.high_score)`,
            updatedAt: row.updatedAt,
          },
        });
      await tx
        .delete(levelResults)
        .where(and(eq(levelResults.userId, row.userId), eq(levelResults.gameId, row.gameId)));
      if (resultRows.length > 0) {
        await tx.insert(levelResults).values(resultRows);
      }
    });
  }
}
