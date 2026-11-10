import {
  type LevelResultRow,
  ProgressRowMapper,
} from '../../src/adapters/persistence/progress-row.mapper.js';
import type {
  ProgressChange,
  ProgressRepository,
} from '../../src/application/ports/progress-repository.js';
import type { GameId } from '../../src/domain/progress/game-id.js';
import type { PlayerProgress } from '../../src/domain/progress/player-progress.js';
import type { UserId } from '../../src/domain/user/user-id.js';

// Test double for the ProgressRepository port. It keeps one progress per
// userId and gameId. It keeps a copy and returns a copy, as the Drizzle
// adapter keeps rows. It applies no domain rule: the aggregate does.
export class InMemoryProgressRepository implements ProgressRepository {
  private readonly progressByKey = new Map<string, PlayerProgress>();
  // The last update of each key. A new update of the key waits for it, as
  // the advisory lock of the Drizzle adapter makes a second sync wait.
  private readonly lastUpdateByKey = new Map<string, Promise<unknown>>();

  find(userId: UserId, gameId: GameId): Promise<PlayerProgress | null> {
    const stored = this.progressByKey.get(keyOf(userId, gameId));
    return Promise.resolve(stored === undefined ? null : copyOf(stored));
  }

  update(userId: UserId, gameId: GameId, change: ProgressChange): Promise<PlayerProgress | null> {
    const key = keyOf(userId, gameId);
    const previous = this.lastUpdateByKey.get(key) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        // The read awaits, as a database read does. So an update without
        // the wait above would let another update run in between.
        const stored = await this.find(userId, gameId);
        const changed = change(stored);
        if (changed !== null) {
          this.progressByKey.set(key, copyOf(changed));
        }
        return changed;
      });
    this.lastUpdateByKey.set(key, current);
    return current;
  }

  // Not part of the port. A test seeds a stored progress with it, for
  // example the tests of GetProgress. It runs through update().
  async save(progress: PlayerProgress): Promise<void> {
    const { userId, gameId } = progress.snapshot();
    await this.update(userId, gameId, () => progress);
  }
}

// JSON keeps the two values apart, whatever characters they hold.
function keyOf(userId: UserId, gameId: GameId): string {
  return JSON.stringify([userId.value, gameId.value]);
}

// A new aggregate with the same state. The copy goes through the rows of
// ProgressRowMapper, as the Drizzle adapter keeps and reads the aggregate.
// The copy holds the results by levelId, as the port promises.
function copyOf(progress: PlayerProgress): PlayerProgress {
  return ProgressRowMapper.toAggregate(
    ProgressRowMapper.toProgressRow(progress),
    ProgressRowMapper.toLevelResultRows(progress).toSorted(byLevelId),
  );
}

// Text order by UTF-16 code unit. For ASCII levelId values it is the order
// of a Postgres text column with the C collation, which PGlite uses.
function byLevelId(left: LevelResultRow, right: LevelResultRow): number {
  if (left.levelId === right.levelId) {
    return 0;
  }
  return left.levelId < right.levelId ? -1 : 1;
}
