import type { GetProgressRequest } from '../../application/progress/get-progress.use-case.js';
import { withProgressRules } from '../../application/progress/progress-problem.js';
import type { SyncProgressRequest } from '../../application/progress/sync-progress.use-case.js';
import { GameId } from '../../domain/progress/game-id.js';
import { LevelResult, type LevelResultValues } from '../../domain/progress/level-result.js';
import type { PlayerProgress } from '../../domain/progress/player-progress.js';
import { Score } from '../../domain/progress/score.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { ProgressDto } from './progress.dto.js';

// Translates between the progress DTOs and the progress entities
// (decision 12). The controller holds no translation code. The mapper builds
// the domain values of each request, so a use case gets them built. A value
// that breaks its rule gives the message of the rule as the one problem.
export const ProgressDtoMapper = {
  // The app has no validation pipe, so the mapper checks the body shape. The
  // domain checks the rules of each value. The userId comes from the token.
  // The values are built in one order: the gameId, the results, the score.
  // So the first broken rule in that order gives the problem.
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
    const values = withProgressRules(() => ({
      gameId: GameId.of(gameId as string),
      // LevelResult.of() checks the type and the rule of each field.
      results: (results as LevelResultValues[]).map((result) => LevelResult.of(result)),
      score: score === undefined || score === null ? undefined : Score.of(score as number),
    }));
    return values.ok ? ok({ userId, ...values.value }) : err(values.error.problems);
  },

  // The gameId of a read comes from the path.
  toGetRequest(gameId: string, userId: UserId): Result<GetProgressRequest, string[]> {
    const built = withProgressRules(() => GameId.of(gameId));
    return built.ok ? ok({ userId, gameId: built.value }) : err(built.error.problems);
  },

  // The mapper reads the snapshot of the aggregate, its Memento.
  toDto(progress: PlayerProgress): ProgressDto {
    const { gameId, highScore, updatedAt, results } = progress.snapshot();
    return {
      gameId: gameId.value,
      // The JSON body keeps numbers and strings.
      highScore: highScore?.value ?? null,
      updatedAt: updatedAt.toISOString(),
      results: results.map((result) => ({
        levelId: result.levelId.value,
        stars: result.stars.value,
        moves: result.moves.value,
        elapsedMs: result.elapsedTime.value,
      })),
    };
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
