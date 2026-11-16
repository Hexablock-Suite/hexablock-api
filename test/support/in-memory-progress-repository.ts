import { receiveProgressKeyOf } from '../../src/adapters/received.js';
import {
  type LevelResultRow,
  ProgressRowMapper,
} from '../../src/adapters/persistence/progress-row.mapper.js';
import type {
  ProgressChange,
  ProgressRepository,
} from '../../src/application/ports/progress-repository.js';
import type { PlayerProgress } from '../../src/domain/progress/player-progress.js';
import type { ProgressKey } from '../../src/domain/progress/progress-key.js';
import { progressPartsOf } from './recording-receiver.js';

// Test double for the ProgressRepository port. It keeps one progress per
// ProgressKey. It keeps a copy and returns a copy, as the Drizzle
// adapter keeps rows. It applies no domain rule: the aggregate does.
export class InMemoryProgressRepository implements ProgressRepository {
  private readonly progressByKey = new Map<string, PlayerProgress>();
  // The last update of each key. A new update of the key waits for it, as
  // the advisory lock of the Drizzle adapter makes a second sync wait.
  private readonly lastUpdateByKey = new Map<string, Promise<unknown>>();

  find(key: ProgressKey): Promise<PlayerProgress | null> {
    const stored = this.progressByKey.get(textOf(key));
    return Promise.resolve(stored === undefined ? null : copyOf(stored));
  }

  update(key: ProgressKey, change: ProgressChange): Promise<PlayerProgress | null> {
    const text = textOf(key);
    const previous = this.lastUpdateByKey.get(text) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        // The read awaits, as a database read does. So an update without
        // the wait above would let another update run in between.
        const stored = await this.find(key);
        const changed = change(stored);
        if (changed !== null) {
          this.progressByKey.set(text, copyOf(changed));
        }
        return changed;
      });
    this.lastUpdateByKey.set(text, current);
    return current;
  }

  // Not part of the port. A test seeds a stored progress with it, for
  // example the tests of GetProgress. It runs through update().
  async save(progress: PlayerProgress): Promise<void> {
    await this.update(progressPartsOf(progress).key, () => progress);
  }
}

// The text of a map key. The ProgressKey delivers its two values, and JSON
// keeps them apart, whatever characters they hold.
function textOf(key: ProgressKey): string {
  const { userId, gameId } = receiveProgressKeyOf(key);
  return JSON.stringify([userId, gameId]);
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
