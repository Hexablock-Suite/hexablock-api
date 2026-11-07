import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  ProgressChange,
  ProgressRepository,
} from '../../application/ports/progress-repository.js';
import type { GameId } from '../../domain/progress/game-id.js';
import type { PlayerProgress } from '../../domain/progress/player-progress.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { PersistenceDatabase } from './drizzle-user-repository.js';
import { ProgressRowMapper } from './progress-row.mapper.js';
import { levelResults, progress } from './schema.js';

// The database handle or one of its transactions. Both run the same queries.
type Queries = Pick<PersistenceDatabase, 'select' | 'insert' | 'delete'>;

// Adapter of the ProgressRepository port over the progress and level_results
// tables of DS-5 (API-FR-02). It reads and writes the whole aggregate.
export class DrizzleProgressRepository implements ProgressRepository {
  constructor(private readonly db: PersistenceDatabase) {}

  find(userId: UserId, gameId: GameId): Promise<PlayerProgress | null> {
    return readAggregate(this.db, userId, gameId);
  }

  // One transaction holds an advisory lock for the userId and the gameId.
  // A row lock is not enough: the first sync of a game has no row to lock.
  // A second update of the key waits for the lock, so it reads what the
  // first one saved. Postgres releases the lock at commit or rollback.
  // When the change throws, the transaction rolls back and saves nothing.
  async update(
    userId: UserId,
    gameId: GameId,
    change: ProgressChange,
  ): Promise<PlayerProgress | null> {
    return this.db.transaction(async (tx) => {
      // A gameId is a lowercase slug and holds no colon, so the text names
      // one key. Two keys with the same 64-bit hash only wait for each other.
      const lockKey = `${userId.value}:${gameId.value}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const changed = change(await readAggregate(tx, userId, gameId));
      if (changed !== null) {
        await writeAggregate(tx, changed);
      }
      return changed;
    });
  }
}

async function readAggregate(
  db: Queries,
  userId: UserId,
  gameId: GameId,
): Promise<PlayerProgress | null> {
  const [row] = await db
    .select()
    .from(progress)
    .where(and(eq(progress.userId, userId.value), eq(progress.gameId, gameId.value)))
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
