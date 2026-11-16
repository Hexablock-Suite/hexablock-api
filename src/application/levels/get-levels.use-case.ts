import type { LevelDefinition } from '../../domain/level/level-definition.js';
import { ok, type Result } from '../../domain/shared/result.js';
import type { LevelRepository } from '../ports/level-repository.js';
import type { UseCase } from '../use-case.js';

// Input port of the level read (API-FR-04). It binds UseCase, so one aspect
// can wrap it (decision 7). The read takes no request: one call gives every
// level. It has no expected failure, so its error type is never: never meets
// the kind bound of LoggingAspect.
export type GetLevels = UseCase<void, Result<readonly LevelDefinition<unknown>[], never>>;

export const GET_LEVELS = Symbol('GetLevels');

// Gives every stored level, by gameId and then by levelId, as
// LevelRepository.list() gives them. No validator runs: LevelRowMapper
// restores each row through the strategy of its gameId. A stored row that
// breaks a rule is a server fault, so the read throws.
export class GetLevelsUseCase implements GetLevels {
  constructor(private readonly levels: LevelRepository) {}

  async execute(): Promise<Result<readonly LevelDefinition<unknown>[], never>> {
    return ok(await this.levels.list());
  }
}
