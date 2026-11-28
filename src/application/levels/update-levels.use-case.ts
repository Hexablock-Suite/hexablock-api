import type { LevelDefinition } from '../../domain/level/level-definition.js';
import type { LevelOrder } from '../../domain/level/level-order.js';
import type { LevelValidators } from '../../domain/level/level-validators.js';
import type { LevelVersion } from '../../domain/level/level-version.js';
import type { TopologyId } from '../../domain/level/topology-id.js';
import type { GameId } from '../../domain/shared/game-id.js';
import type { LevelId } from '../../domain/shared/level-id.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { UserId } from '../../domain/shared/user-id.js';
import type { LevelUpdater } from '../ports/level-repository.js';
import type { UseCase } from '../use-case.js';
import type { InvalidLevels, LevelProblemReport } from './invalid-levels.js';
import type { NotALevelEditor } from './not-a-level-editor.js';

// One level of an update. The mapper of the border builds the values of
// the common part (decision 12). The section stays as it arrives, because
// only the strategy of the gameId knows its section type (#77).
export interface IncomingLevel {
  readonly gameId: GameId;
  readonly levelId: LevelId;
  readonly order: LevelOrder;
  readonly version: LevelVersion;
  readonly topology: TopologyId;
  readonly section: unknown;
}

// The input of UpdateLevels: the UserId of the signed-in account and a batch
// of levels, in the order of the body. AuthorizationAspect reads the UserId
// (#180); the use case reads only the levels.
export interface UpdateLevelsRequest {
  readonly userId: UserId;
  readonly levels: readonly IncomingLevel[];
}

// The expected failures of the level update: a level that breaks a rule,
// and an account outside the list of level editors, which
// AuthorizationAspect gives (#180). Each one carries a kind, so
// LoggingAspect logs it.
export type UpdateLevelsError = InvalidLevels | NotALevelEditor;

// Input port of the level update (API-FR-04). It binds UseCase, so the
// aspects can wrap it (decision 7). AppModule wraps it in LoggingAspect over
// AuthorizationAspect.
export type UpdateLevels = UseCase<UpdateLevelsRequest, Result<void, UpdateLevelsError>>;

export const UPDATE_LEVELS = Symbol('UpdateLevels');

// A level that passed its check, with the key that its update locks. The
// use case keeps the key of the request, because it never opens a level.
interface CheckedLevel {
  readonly gameId: GameId;
  readonly levelId: LevelId;
  readonly level: LevelDefinition;
}

// Checks every level of the batch through LevelValidators before it saves
// any level. A broken level gives one problem, and no level is saved. Then
// it saves level by level, each in its own transaction, through
// LevelRepository.update(). Each level is the root of its own aggregate, so
// one transaction changes one level (section «Domain design rules»). It
// holds only the LevelUpdater role of that port (decision 23, #193).
// The change of each update asks the incoming level: decideReplace() runs
// the version rule of S3-10 in LevelDefinition, under the lock of the level.
// A lower version saves nothing for that level, and the use
// case reports it as a level problem. A stored row that breaks a rule has
// no level, and the level of the update replaces it (#147). The version rule
// still compares with the version of that row when its version column holds
// a valid version. When that column breaks the rule of LevelVersion, there
// is no version to compare, and any valid version replaces the row. This also covers a race: another
// update can save a newer copy between the check and the save. The other
// levels of the batch are still saved. An equal version passes, so a retry
// of the same batch is safe. A save that throws stops the batch: the levels
// saved before it stay saved, and the error reaches the caller.
export class UpdateLevelsUseCase implements UpdateLevels {
  constructor(
    private readonly levels: LevelUpdater,
    private readonly rules: LevelValidators,
  ) {}

  async execute(request: UpdateLevelsRequest): Promise<Result<void, InvalidLevels>> {
    const checked = this.check(request.levels);
    if (!checked.ok) {
      return checked;
    }
    const problems: LevelProblemReport[] = [];
    for (const { gameId, levelId, level } of checked.value) {
      // The saves run one after the other, in the order of the batch, so a
      // failed save keeps exactly the levels before it.
      // oxlint-disable-next-line no-await-in-loop -- Each save waits for the save before it.
      const saved = await this.levels.update(gameId, levelId, (stored) =>
        level.decideReplace(stored),
      );
      if (!saved.ok) {
        problems.push({ gameId, levelId, problem: saved.error });
      }
    }
    return problems.length === 0 ? ok(undefined) : err(invalidLevels(problems));
  }

  // Builds each level through the strategy of its gameId. No level exists
  // before its strategy builds the section (#77).
  private check(incoming: readonly IncomingLevel[]): Result<CheckedLevel[], InvalidLevels> {
    const checked: CheckedLevel[] = [];
    const problems: LevelProblemReport[] = [];
    for (const { gameId, levelId, order, version, topology, section } of incoming) {
      const level = this.rules.check(gameId, levelId, order, version, topology, section);
      if (level.ok) {
        checked.push({ gameId, levelId, level: level.value });
      } else {
        problems.push({ gameId, levelId, problem: level.error });
      }
    }
    return problems.length === 0 ? ok(checked) : err(invalidLevels(problems));
  }
}

function invalidLevels(problems: readonly LevelProblemReport[]): InvalidLevels {
  return { kind: 'invalid-levels', problems };
}
