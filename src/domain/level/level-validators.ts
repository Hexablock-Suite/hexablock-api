import type { GameId } from '../shared/game-id.js';
import type { LevelId } from '../shared/level-id.js';
import { err, type Result } from '../shared/result.js';
import { LevelDefinition } from './level-definition.js';
import type { LevelOrder } from './level-order.js';
import type { LevelProblem } from './level-problem.js';
import type { LevelSection } from './level-section.js';
import type { LevelValidator } from './level-validator.js';
import type { LevelVersion } from './level-version.js';
import type { TopologyId } from './topology-id.js';

// One entry of the registry: a game with level files and its strategy.
export type LevelValidatorEntry = readonly [GameId, LevelValidator<LevelSection>];

// Domain service (decision 5). It picks the strategy of an incoming level
// from its gameId, outside any LevelDefinition: no level exists before its
// strategy builds the section. The composition root builds it once, with one
// entry per variant with level files. It keeps no state that changes.
// It finds a strategy with GameId.equals(), never with a Map: a Map compares
// object keys by reference, so two equal GameId values would be two keys.
export class LevelValidators {
  private constructor(private readonly entries: readonly LevelValidatorEntry[]) {}

  // Two entries for one game are a defect of the composition root, not a
  // datum of a level, so this guard throws.
  static of(entries: readonly LevelValidatorEntry[]): LevelValidators {
    const repeated = entries.some(([gameId], index) =>
      entries.slice(0, index).some(([earlier]) => earlier.equals(gameId)),
    );
    if (repeated) {
      throw new RangeError('LevelValidators takes one strategy per gameId.');
    }
    return new LevelValidators(Object.freeze([...entries]));
  }

  // Builds a valid level of a game with level files. The border builds the
  // values of the common part and passes the section as it arrives, because
  // only the strategy of the game knows its section type. A game with no
  // strategy, as Lines and Merge, gives game-without-levels (API-FR-04).
  check(
    gameId: GameId,
    levelId: LevelId,
    order: LevelOrder,
    version: LevelVersion,
    topology: TopologyId,
    section: unknown,
  ): Result<LevelDefinition, LevelProblem> {
    const entry = this.entries.find(([served]) => served.equals(gameId));
    if (entry === undefined) {
      return err('game-without-levels');
    }
    const [, strategy] = entry;
    return LevelDefinition.of(
      gameId,
      levelId,
      order,
      version,
      topology,
      strategy.sectionOf(section, topology),
    );
  }
}
