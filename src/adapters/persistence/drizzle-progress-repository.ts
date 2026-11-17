import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  ProgressChange,
  ProgressRepository,
} from '../../application/ports/progress-repository.js';
import type { PlayerProgress } from '../../domain/progress/player-progress.js';
import type { ProgressKey } from '../../domain/progress/progress-key.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import { receiveProgressKeyOf } from '../received.js';
import type { PersistenceDatabase } from './drizzle-user-repository.js';
import { ProgressRowMapper } from './progress-row.mapper.js';
import { levelResults, progress } from './schema.js';
import { FOREIGN_KEY_VIOLATION, hasSqlState } from './sql-state.js';

// The database handle or one of its transactions. Both run the same queries.
type Queries = Pick<PersistenceDatabase, 'select' | 'insert' | 'delete'>;

// Adapter of the ProgressRepository port over the progress and level_results
// tables of DS-5 (API-FR-02). It reads and writes the whole aggregate.
export class DrizzleProgressRepository implements ProgressRepository {
  constructor(private readonly db: PersistenceDatabase) {}

  find(key: ProgressKey): Promise<PlayerProgress | null> {
    return readAggregate(this.db, key);
  }

  // One transaction holds an advisory lock for the key: the userId and the
  // gameId. A row lock is not enough: the first sync of a game has no row to
  // lock. A second update of the key waits for the lock, so it reads what
  // the first one saved. Postgres releases the lock at commit or rollback.
  // When the change throws, the transaction rolls back and saves nothing.
  // When the foreign key to users.id rejects the write, the transaction
  // rolls back too, and the update fails with unknown-user (#137). It is
  // the one foreign key that the write can break: the progress row comes
  // before its level_results rows.
  async update(
    key: ProgressKey,
    change: ProgressChange,
  ): Promise<Result<PlayerProgress | null, 'unknown-user'>> {
    try {
      return ok(await this.lockedUpdate(key, change));
    } catch (error) {
      if (hasSqlState(error, FOREIGN_KEY_VIOLATION)) {
        return err('unknown-user');
      }
      throw error;
    }
  }

  private lockedUpdate(key: ProgressKey, change: ProgressChange): Promise<PlayerProgress | null> {
    return this.db.transaction(async (tx) => {
      // The key delivers its userId and its gameId. A gameId is a lowercase
      // slug and holds no colon, so the text names one key. Two keys with
      // the same 64-bit hash only wait for each other.
      const { userId, gameId } = receiveProgressKeyOf(key);
      const lockKey = `${userId}:${gameId}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const changed = change(await readAggregate(tx, key));
      if (changed !== null) {
        await writeAggregate(tx, changed);
      }
      return changed;
    });
  }
}

async function readAggregate(db: Queries, key: ProgressKey): Promise<PlayerProgress | null> {
  const { userId, gameId } = receiveProgressKeyOf(key);
  const [row] = await db
    .select()
    .from(progress)
    .where(and(eq(progress.userId, userId), eq(progress.gameId, gameId)))
    .limit(1);
  if (row === undefined) {
    return null;
  }
  // The tables keep no record order, so the results come back by levelId.
  const resultRows = await db
    .select()
    .from(levelResults)
    .where(and(eq(levelResults.userId, row.userId), eq(levelResults.gameId, row.gameId)))
    .orderBy(asc(levelResults.levelId));
  return ProgressRowMapper.toAggregate(row, resultRows);
}

// The primary key on userId and gameId keeps one progress row: a second
// write updates it with the values that the aggregate holds. The domain
// keeps the highest score, so the row needs no rule of its own. The
// level_results rows of the key are written again; the advisory lock keeps
// a second writer out. The foreign key to users.id rejects an unknown user.
async function writeAggregate(db: Queries, aggregate: PlayerProgress): Promise<void> {
  const row = ProgressRowMapper.toProgressRow(aggregate);
  const resultRows = ProgressRowMapper.toLevelResultRows(aggregate);
  await db
    .insert(progress)
    .values(row)
    .onConflictDoUpdate({
      target: [progress.userId, progress.gameId],
      set: { highScore: row.highScore, updatedAt: row.updatedAt },
    });
  await db
    .delete(levelResults)
    .where(and(eq(levelResults.userId, row.userId), eq(levelResults.gameId, row.gameId)));
  if (resultRows.length > 0) {
    await db.insert(levelResults).values(resultRows);
  }
}
