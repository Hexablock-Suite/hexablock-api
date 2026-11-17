import type { GameId } from '../progress/game-id.js';
import type { LevelId } from '../progress/level-id.js';
import type { LevelResult } from '../progress/level-result.js';
import type { Stars } from '../progress/stars.js';
import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';
import type { LevelOrder } from './level-order.js';
import type { LevelProblem } from './level-problem.js';
import type { LevelSection } from './level-section.js';
import type { LevelVersion } from './level-version.js';
import type { TopologyId } from './topology-id.js';

// Entity and aggregate root of one level definition (DS-6, API-FR-04, decision
// 4). Its identity is the gameId plus the levelId. It holds the common part
// and the section of its game: TSection is FitSection or SortSection.
// A level is born valid. of() builds a level only from a section that its
// section type accepted, so no level with an unchecked section exists.
// The boundary is one level. The section rules hold inside one level, and so
// does the version rule of S3-10, which compares two copies of the same level.
// No requirement links two levels (DS-6, DS-11, S3-02, S3-10).
// The level has no getter. deliverTo() gives its parts to a receiver of the
// border, in the fields of the shared level format (docs/level-format.md).
export class LevelDefinition<TSection> {
  private constructor(
    private readonly gameId: GameId,
    private readonly levelId: LevelId,
    private readonly order: LevelOrder,
    private readonly version: LevelVersion,
    private readonly topology: TopologyId,
    private readonly section: TSection & LevelSection,
  ) {}

  // Takes the Result of the section factory. A failed section gives its level
  // problem, and no level exists. The values of the common part check their
  // own rules when the border builds them.
  static of<TSection extends LevelSection>(
    gameId: GameId,
    levelId: LevelId,
    order: LevelOrder,
    version: LevelVersion,
    topology: TopologyId,
    section: Result<TSection, LevelProblem>,
  ): Result<LevelDefinition<TSection>, LevelProblem> {
    return section.ok
      ? ok(new LevelDefinition(gameId, levelId, order, version, topology, section.value))
      : section;
  }

  // Two levels are the same level when they have the same gameId and the
  // same levelId. The other data does not count: two copies of one level can
  // have two versions (DS-11).
  equals(other: LevelDefinition<unknown>): boolean {
    return this.isIdentifiedBy(other.gameId, other.levelId);
  }

  // Tells if this level has this gameId and this levelId. LevelRepository
  // saves a level only under the key that it locks.
  isIdentifiedBy(gameId: GameId, levelId: LevelId): boolean {
    return this.gameId.equals(gameId) && this.levelId.equals(levelId);
  }

  // The version rule of S3-10. This level is the stored copy. It accepts an
  // incoming copy with an equal or a higher version, and it gives that copy.
  // It rejects a lower version with older-version. An equal version passes,
  // so a retry of the same update is safe. The rule compares two copies of
  // one level, so another level is a defect of the caller and throws.
  accepts(incoming: LevelDefinition<TSection>): Result<LevelDefinition<TSection>, LevelProblem> {
    if (!this.equals(incoming)) {
      throw new RangeError('The version rule compares two copies of one level.');
    }
    return incoming.isOlderThan(this.version) ? err('older-version') : ok(incoming);
  }

  // Tells if this copy is older than a stored version (S3-10). A stored row
  // that breaks a rule gives only its version, so the version rule over that
  // row compares with the version alone (#147). An equal version is not older.
  isOlderThan(version: LevelVersion): boolean {
    return this.version.isOlderThan(version);
  }

  // Tells if a result of a sync of this gameId is a play of this level: the
  // same gameId and the same levelId (#135).
  isLevelOf(gameId: GameId, result: LevelResult): boolean {
    return this.gameId.equals(gameId) && result.isFor(this.levelId);
  }

  // The most stars that a play of this level can carry: the count of the
  // star thresholds of its section (DS-6, decided on #134, built on #135).
  mostStars(): Stars {
    return this.section.mostStars();
  }

  // Tells if a play of this level can carry the stars of the result. The
  // caller pairs the result with its level through isLevelOf().
  admits(result: LevelResult): boolean {
    return !result.hasMoreStarsThan(this.mostStars());
  }

  // Delivers the common part and the section to a receiver of the border, in
  // the fields of the shared level format. No operation returns them. Each
  // part delivers its own value in turn, and the section delivers its parts.
  deliverTo(
    receiver: ValueReceiver<{
      readonly gameId: GameId;
      readonly levelId: LevelId;
      readonly order: LevelOrder;
      readonly version: LevelVersion;
      readonly topology: TopologyId;
      readonly section: TSection;
    }>,
  ): void {
    receiver.receive({
      gameId: this.gameId,
      levelId: this.levelId,
      order: this.order,
      version: this.version,
      topology: this.topology,
      section: this.section,
    });
  }
}
