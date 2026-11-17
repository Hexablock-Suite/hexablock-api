import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  LevelChange,
  LevelRepository,
  StoredLevel,
} from '../../application/ports/level-repository.js';
import type { LevelDefinition } from '../../domain/level/level-definition.js';
import type { LevelProblem } from '../../domain/level/level-problem.js';
import type { LevelValidators } from '../../domain/level/level-validators.js';
import type { GameId } from '../../domain/progress/game-id.js';
import type { LevelId } from '../../domain/progress/level-id.js';
import type { Result } from '../../domain/shared/result.js';
import { receiveValueOf } from '../received.js';
import type { PersistenceDatabase } from './drizzle-user-repository.js';
import { LevelRowMapper } from './level-row.mapper.js';
import { levels } from './schema.js';

// The database handle or one of its transactions. Both run the same queries.
type Queries = Pick<PersistenceDatabase, 'select'>;

// Adapter of the LevelRepository port over the levels table of DS-6
// (API-FR-04). LevelRowMapper restores each row through the strategy that
// LevelValidators finds for its gameId, so every level that it gives is valid.
// A row that no strategy accepts is a broken row: update() passes it to the
// change as the broken state (#147), and list() throws for it.
export class DrizzleLevelRepository implements LevelRepository {
  constructor(
    private readonly db: PersistenceDatabase,
    private readonly validators: LevelValidators,
  ) {}

  // The tables keep no record order, so the rows come back by gameId and
  // then by levelId, as the port promises.
  async list(): Promise<readonly LevelDefinition<unknown>[]> {
    const rows = await this.db
      .select()
      .from(levels)
      .orderBy(asc(levels.gameId), asc(levels.levelId));
    return rows.map((row) => LevelRowMapper.toLevel(row, this.validators));
  }

  // The lock pattern of DrizzleProgressRepository.update() (decision 2). One
  // transaction holds an advisory lock for the gameId and the levelId. A row
  // lock is not enough: the first update of a level has no row to lock. A
  // second update of the key waits for the lock, so it reads what the first
  // one saved, and the version rule of its change compares with that level.
  // Postgres releases the lock at commit or rollback. When the change
  // throws, the transaction rolls back and saves nothing. The adapter adds
  // no level rule: the change runs the version rule of S3-10. A broken row
  // reaches the change as the broken state, and the level that the change
  // returns replaces it (#147).
  async update(
    gameId: GameId,
    levelId: LevelId,
    change: LevelChange,
  ): Promise<Result<LevelDefinition<unknown>, LevelProblem>> {
    return this.db.transaction(async (tx) => {
      // A gameId is a lowercase slug and holds no colon, so the text names
      // one level. The levels: prefix keeps the key apart from the progress
      // keys. Two keys with the same 64-bit hash only wait for each other.
      const lockKey = `levels:${receiveValueOf(gameId)}:${receiveValueOf(levelId)}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const changed = change(await this.read(tx, gameId, levelId));
      if (changed.ok) {
        await write(tx, gameId, levelId, changed.value);
      }
      return changed;
    });
  }

  private async read(db: Queries, gameId: GameId, levelId: LevelId): Promise<StoredLevel> {
    const [row] = await db
      .select()
      .from(levels)
      .where(
        and(eq(levels.gameId, receiveValueOf(gameId)), eq(levels.levelId, receiveValueOf(levelId))),
      )
      .limit(1);
    return row === undefined
      ? { state: 'absent' }
      : LevelRowMapper.toStoredLevel(row, this.validators);
  }
}

// The primary key on gameId and levelId keeps one row per level: a second
// write replaces the other columns. The lock covers only the key of the
// update, so a level with another key is a defect of the change.
async function write(
  db: Pick<PersistenceDatabase, 'insert'>,
  gameId: GameId,
  levelId: LevelId,
  level: LevelDefinition<unknown>,
): Promise<void> {
  if (!level.isIdentifiedBy(gameId, levelId)) {
    throw new RangeError('The change must return the level that update() locks.');
  }
  const row = LevelRowMapper.toRow(level);
  await db
    .insert(levels)
    .values(row)
    .onConflictDoUpdate({
      target: [levels.gameId, levels.levelId],
      set: {
        order: row.order,
        version: row.version,
        topology: row.topology,
        section: row.section,
      },
    });
}
