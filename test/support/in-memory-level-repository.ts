import { type LevelRow, LevelRowMapper } from '../../src/adapters/persistence/level-row.mapper.js';
import { receiveValueOf } from '../../src/adapters/received.js';
import type { LevelChange, LevelRepository } from '../../src/application/ports/level-repository.js';
import type { LevelDefinition } from '../../src/domain/level/level-definition.js';
import type { LevelProblem } from '../../src/domain/level/level-problem.js';
import type { LevelValidators } from '../../src/domain/level/level-validators.js';
import type { GameId } from '../../src/domain/progress/game-id.js';
import type { LevelId } from '../../src/domain/progress/level-id.js';
import type { Result } from '../../src/domain/shared/result.js';

// Test double for the LevelRepository port. It keeps one row per gameId and
// levelId, written and read through LevelRowMapper, as the Drizzle adapter
// keeps rows. So each level that it gives is a new copy, restored through
// the strategy of its gameId. It applies no level rule: the change does.
export class InMemoryLevelRepository implements LevelRepository {
  private readonly rowsByKey = new Map<string, LevelRow>();
  // The last update of each key. A new update of the key waits for it, as
  // the advisory lock of the Drizzle adapter makes a second update wait.
  private readonly lastUpdateByKey = new Map<string, Promise<unknown>>();

  constructor(private readonly validators: LevelValidators) {}

  list(): Promise<readonly LevelDefinition<unknown>[]> {
    const rows = [...this.rowsByKey.values()].toSorted(byGameAndLevelId);
    return Promise.resolve(rows.map((row) => LevelRowMapper.toLevel(row, this.validators)));
  }

  update(
    gameId: GameId,
    levelId: LevelId,
    change: LevelChange,
  ): Promise<Result<LevelDefinition<unknown>, LevelProblem>> {
    const key = keyOf(gameId, levelId);
    const previous = this.lastUpdateByKey.get(key) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        // The read awaits, as a database read does. So an update without
        // the wait above would let another update run in between.
        const row = await Promise.resolve(this.rowsByKey.get(key));
        const changed = change(
          row === undefined ? null : LevelRowMapper.toLevel(row, this.validators),
        );
        if (changed.ok) {
          if (!changed.value.isIdentifiedBy(gameId, levelId)) {
            throw new RangeError('The change must return the level that update() locks.');
          }
          this.rowsByKey.set(key, LevelRowMapper.toRow(changed.value));
        }
        return changed;
      });
    this.lastUpdateByKey.set(key, current);
    return current;
  }
}

// JSON keeps the two values apart, whatever characters they hold.
function keyOf(gameId: GameId, levelId: LevelId): string {
  return JSON.stringify([receiveValueOf(gameId), receiveValueOf(levelId)]);
}

// Text order by UTF-16 code unit, first by gameId and then by levelId. For
// ASCII values it is the order of a Postgres text column with the C
// collation, which PGlite uses.
function byGameAndLevelId(left: LevelRow, right: LevelRow): number {
  return compareText(left.gameId, right.gameId) || compareText(left.levelId, right.levelId);
}

function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
