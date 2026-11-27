import { ok, type Result } from '../../domain/shared/result.js';
import type { LevelRepository } from '../ports/level-repository.js';
import type { ListedLevels } from './listed-levels.js';
import type { UseCase } from '../use-case.js';

// Input port of the level read (API-FR-04). It binds UseCase, so one aspect
// can wrap it (decision 7). The read takes no request: one call gives every
// level. It has no expected failure, so its error type is never: never meets
// the kind bound of LoggingAspect.
export type GetLevels = UseCase<void, Result<ListedLevels, never>>;

export const GET_LEVELS = Symbol('GetLevels');

// Gives every stored level, by gameId and then by levelId, as
// LevelRepository.list() gives them. No validator runs: LevelRowMapper
// restores each row through the strategy of its gameId. A stored row that
// breaks a rule hides no other level (#147). The read gives it apart, as an
// unavailable level with its key and the code of its rule. The use case
// holds no logger: LoggingAspect wraps it and writes one entry per such row
// through unavailableLevelEntries() (#219, decision 19).
export class GetLevelsUseCase implements GetLevels {
  constructor(private readonly levels: LevelRepository) {}

  async execute(): Promise<Result<ListedLevels, never>> {
    return ok(await this.levels.list());
  }
}
