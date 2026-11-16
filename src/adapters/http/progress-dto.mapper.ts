import type { GetProgressRequest } from '../../application/progress/get-progress.use-case.js';
import { withProgressRules } from '../../application/progress/progress-problem.js';
import type { SyncProgressRequest } from '../../application/progress/sync-progress.use-case.js';
import { ElapsedTime } from '../../domain/progress/elapsed-time.js';
import { GameId } from '../../domain/progress/game-id.js';
import { LevelId } from '../../domain/progress/level-id.js';
import { LevelResult } from '../../domain/progress/level-result.js';
import { Moves } from '../../domain/progress/moves.js';
import type { PlayerProgress } from '../../domain/progress/player-progress.js';
import { Score } from '../../domain/progress/score.js';
import { Stars } from '../../domain/progress/stars.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { UserId } from '../../domain/user/user-id.js';
import { receiveProgressOf } from '../received.js';
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
      // The shape check above makes each result an object.
      results: (results as Record<string, unknown>[]).map(levelResultOf),
      score: score === undefined || score === null ? undefined : Score.of(score as number),
    }));
    return values.ok ? ok({ userId, ...values.value }) : err(values.error.problems);
  },

  // The gameId of a read comes from the path.
  toGetRequest(gameId: string, userId: UserId): Result<GetProgressRequest, string[]> {
    const built = withProgressRules(() => GameId.of(gameId));
    return built.ok ? ok({ userId, gameId: built.value }) : err(built.error.problems);
  },

  // The aggregate delivers its parts to the mapper. The mapper receives the
  // value that each value object delivers. The JSON body keeps numbers and
  // strings, and each LevelResult delivers its four values in one call.
  toDto(progress: PlayerProgress): ProgressDto {
    const { gameId, highScore, updatedAt, results } = receiveProgressOf(progress);
    return { gameId, highScore, updatedAt: updatedAt.toISOString(), results };
  },
};

// Builds the four value objects of one result in the order of the fields:
// the levelId, the stars, the moves, then the time. Each value object checks
// the type and the rule of its field, so the first broken rule stops the build.
function levelResultOf(result: Record<string, unknown>): LevelResult {
  return LevelResult.of(
    LevelId.of(result.levelId as string),
    Stars.of(result.stars as number),
    Moves.of(result.moves as number),
    ElapsedTime.ofMs(result.elapsedMs as number),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
