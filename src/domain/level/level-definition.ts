import type { GameId } from '../progress/game-id.js';
import type { LevelId } from '../progress/level-id.js';
import { ok, type Result } from '../shared/result.js';
import type { LevelOrder } from './level-order.js';
import type { LevelProblem } from './level-problem.js';
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
export class LevelDefinition<TSection> {
  private constructor(
    private readonly gameId: GameId,
    private readonly levelId: LevelId,
    private readonly order: LevelOrder,
    private readonly version: LevelVersion,
    private readonly topology: TopologyId,
    private readonly section: TSection,
  ) {}

  // Takes the Result of the section factory. A failed section gives its level
  // problem, and no level exists. The values of the common part check their
  // own rules when the border builds them.
  static of<TSection>(
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
    return this.gameId.equals(other.gameId) && this.levelId.equals(other.levelId);
  }
}
