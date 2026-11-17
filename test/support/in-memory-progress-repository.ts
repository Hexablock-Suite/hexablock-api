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
import { err, ok, type Result } from '../../src/domain/shared/result.js';
import { progressPartsOf } from './recording-receiver.js';

// Test double for the ProgressRepository port. It keeps one progress per
// ProgressKey. It keeps a copy and returns a copy, as the Drizzle
// adapter keeps rows. It applies no domain rule: the aggregate does.
//
// The Drizzle adapter fails with unknown-user when the foreign key to
// users.id rejects a write (#137). The fake has no users table. It takes
// the ids of the users that it knows, and a save for another user fails
// in the same way. Without ids it knows every user, so a test that needs
// no user store does not build one.
export class InMemoryProgressRepository implements ProgressRepository {
  private readonly progressByKey = new Map<string, PlayerProgress>();
  private readonly knownUserIds: ReadonlySet<string> | null;
  // The last update of each key. A new update of the key waits for it, as
  // the advisory lock of the Drizzle adapter makes a second sync wait.
  private readonly lastUpdateByKey = new Map<string, Promise<unknown>>();

  constructor(knownUserIds?: Iterable<string>) {
    this.knownUserIds =
      knownUserIds === undefined
        ? null
        : new Set(Array.from(knownUserIds, (id) => id.toLowerCase()));
  }

  find(key: ProgressKey): Promise<PlayerProgress | null> {
    const stored = this.progressByKey.get(textOf(key));
    return Promise.resolve(stored === undefined ? null : copyOf(stored));
  }

  update(
    key: ProgressKey,
    change: ProgressChange,
  ): Promise<Result<PlayerProgress | null, 'unknown-user'>> {
    const text = textOf(key);
    const previous = this.lastUpdateByKey.get(text) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        // The read awaits, as a database read does. So an update without
        // the wait above would let another update run in between.
        const stored = await this.find(key);
        const changed = change(stored);
        if (changed === null) {
          return ok(null);
        }
        if (!this.knows(key)) {
          return err('unknown-user' as const);
        }
        this.progressByKey.set(text, copyOf(changed));
        return ok(changed);
      });
    this.lastUpdateByKey.set(text, current);
    return current;
  }

  private knows(key: ProgressKey): boolean {
    return this.knownUserIds === null || this.knownUserIds.has(receiveProgressKeyOf(key).userId);
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
