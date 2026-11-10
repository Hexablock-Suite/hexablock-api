import type { SyncProgressRequest } from '../../application/progress/sync-progress.use-case.js';
import type { LevelResultValues } from '../../domain/progress/level-result.js';
import type { PlayerProgress } from '../../domain/progress/player-progress.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { ProgressDto } from './progress.dto.js';

// Translates between the progress DTOs and the progress entities
// (decision 12). The controller holds no translation code.
export const ProgressDtoMapper = {
  // The app has no validation pipe, so the mapper checks the body shape. The
  // domain checks the rules of each value. The userId comes from the token.
  toRequest(body: unknown, userId: UserId): Result<SyncProgressRequest, string[]> {
    const fields = isObject(body) ? body : {};
    const { gameId, score, results = [] } = fields;
    const problems: string[] = [];
    if (typeof gameId !== 'string') problems.push('gameId must be a string');
    if (score !== undefined && score !== null && typeof score !== 'number') {
      problems.push('score must be a number');
    }
    if (!Array.isArray(results) || !results.every(isObject)) {
      problems.push('results must be an array of objects');
    }
    if (problems.length > 0) {
      return err(problems);
    }
    return ok({
      userId,
      gameId: gameId as string,
      score: (score ?? undefined) as number | undefined,
      // LevelResult.of() checks the type and the rule of each field.
      results: results as LevelResultValues[],
    });
  },

  toDto(progress: PlayerProgress): ProgressDto {
    return {
      gameId: progress.gameId.value,
      // The JSON body keeps a number.
      highScore: progress.highScore?.value ?? null,
      updatedAt: progress.updatedAt.toISOString(),
      results: progress.results.map(({ levelId, stars, moves, elapsedMs }) => ({
        levelId,
        stars,
        moves,
        elapsedMs,
      })),
    };
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
