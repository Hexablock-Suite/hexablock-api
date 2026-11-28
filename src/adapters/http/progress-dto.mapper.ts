import type { GetProgressRequest } from '../../application/progress/get-progress.use-case.js';
import type { ProgressProblem } from '../../application/progress/progress-problem.js';
import type { SyncProgressRequest } from '../../application/progress/sync-progress.use-case.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import type { PlayerProgress } from '../../domain/progress/player-progress.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { UserId } from '../../domain/shared/user-id.js';
import { receiveLevelResultOf, receiveProgressOf, receiveValueOf } from '../received.js';
import type { ProgressDto } from './progress.dto.js';
import { gameIdFrom, levelResultFrom, scoreFrom } from './progress-values.js';

// The domain values of a sync body, without the userId of the token.
type SyncValues = Omit<SyncProgressRequest, 'userId'>;

// Translates between the progress DTOs and the progress entities
// (decision 12). The controller holds no translation code. The mapper builds
// the domain values of each request, so a use case gets them built. A value
// that breaks its rule gives the text of the rule as the one problem: the
// factory gives the code, and progress-values.ts writes the text. The
// mapper also writes the text of each failed Result, and the controller
// only picks the status (#215).
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
    // The shape check above makes each result an object.
    const values = syncValuesOf(gameId, results as Record<string, unknown>[], score);
    return values.ok ? ok({ userId, ...values.value }) : err([values.error]);
  },

  // The gameId of a read comes from the path.
  toGetRequest(gameId: string, userId: UserId): Result<GetProgressRequest, string[]> {
    const built = gameIdFrom(gameId);
    return built.ok ? ok({ userId, gameId: built.value }) : err([built.error]);
  },

  // The aggregate delivers its parts to the mapper. The mapper receives the
  // value that each value object delivers. The JSON body keeps numbers and
  // strings, and each LevelResult delivers its four values in one call.
  toDto(progress: PlayerProgress): ProgressDto {
    const { gameId, highScore, updatedAt, results } = receiveProgressOf(progress);
    return { gameId, highScore, updatedAt: updatedAt.toISOString(), results };
  },

  // The lines of the ErrorDto of a failed Result, one line per problem. The
  // gameId is the text of the request. A gone user gets the text of a bad
  // token, the same text as JwtAuthGuard (#137). A result that its level
  // does not admit names its levelId (#135).
  toProblemDetails(problem: ProgressProblem, gameId: string): string[] {
    switch (problem.kind) {
      case 'progress-not-found':
        return [`No progress for gameId ${gameId}`];
      case 'unknown-user':
        return ['Invalid or expired token'];
      case 'unknown-level': {
        const { levelId } = receiveLevelResultOf(problem.result);
        return [`No level ${levelId} for gameId ${gameId}.`];
      }
      case 'too-many-stars': {
        const { levelId, stars } = receiveLevelResultOf(problem.result);
        const most = receiveValueOf(problem.most);
        return [
          `stars of level ${levelId} must be at most ${most}, the count of its star thresholds, got ${stars}.`,
        ];
      }
    }
  },
};

// Builds the values of a sync body in the order of decision 12: the gameId,
// the results, then the score. Each result builds its four values in the
// order of its fields. Each factory checks the type and the rule of its
// value, so the first broken rule stops the build and gives its text.
function syncValuesOf(
  gameId: unknown,
  results: readonly Record<string, unknown>[],
  score: unknown,
): Result<SyncValues, string> {
  const builtGameId = gameIdFrom(gameId);
  if (!builtGameId.ok) return builtGameId;
  const builtResults: LevelResult[] = [];
  for (const result of results) {
    const builtResult = levelResultFrom(result);
    if (!builtResult.ok) return builtResult;
    builtResults.push(builtResult.value);
  }
  if (score === undefined || score === null) {
    return ok({ gameId: builtGameId.value, results: builtResults, score: undefined });
  }
  const builtScore = scoreFrom(score);
  if (!builtScore.ok) return builtScore;
  return ok({ gameId: builtGameId.value, results: builtResults, score: builtScore.value });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
