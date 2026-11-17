import { ok, type Result } from '../../domain/shared/result.js';
import type { LevelRepository, ListedLevels } from '../ports/level-repository.js';
import type { Logger } from '../ports/logger.js';
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
// unavailable level with its key and the code of its rule, and it logs one
// entry per such row through the Logger port. The entry holds the same data
// and no section. A log write that fails does not change the read, as in
// LoggingAspect.
export class GetLevelsUseCase implements GetLevels {
  constructor(
    private readonly levels: LevelRepository,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<Result<ListedLevels, never>> {
    const listed = await this.levels.list();
    for (const { gameId, levelId, reason } of listed.unavailable) {
      try {
        this.logger.log({
          useCase: 'GetLevels',
          outcome: 'unavailable-level',
          gameId,
          levelId,
          reason,
        });
      } catch {
        // No source gives a policy for a failed log write, so the read drops it.
      }
    }
    return ok(listed);
  }
}
