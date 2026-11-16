import { GameId, type GameIdProblem } from '../../domain/progress/game-id.js';
import { LevelId } from '../../domain/progress/level-id.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import { Score, type ScoreProblem } from '../../domain/progress/score.js';
import { err, type Result } from '../../domain/shared/result.js';
import { buildLevelResult, type LevelResultProblem } from '../built.js';
import type { LevelResultValues } from '../received.js';

// Builds the progress values of a request: a JSON body or a path. The
// factory of each value object returns a Result with the code of the broken
// rule, and this module writes the text of that rule (decision 11). The
// texts name the fields of the JSON body, so they live here and not in the
// domain. Each 400 body keeps them word for word. ProgressDtoMapper,
// LevelDtoMapper and LeaderboardDtoMapper share them.

// The field of a level result that each code names.
const RESULT_FIELDS = {
  'invalid-level-id': 'levelId',
  'invalid-stars': 'stars',
  'invalid-moves': 'moves',
  'invalid-elapsed-time': 'elapsedMs',
} as const satisfies Record<LevelResultProblem, keyof LevelResultValues>;

// The value of a request can have any type. Each factory checks the type of
// its value, so the casts only satisfy the signature of the factory.
export function gameIdFrom(value: unknown): Result<GameId, string> {
  const built = GameId.of(value as string);
  return built.ok ? built : err(ruleText(built.error, value));
}

export function levelIdFrom(value: unknown): Result<LevelId, string> {
  const built = LevelId.of(value as string);
  return built.ok ? built : err(ruleText(built.error, value));
}

export function scoreFrom(value: unknown): Result<Score, string> {
  const built = Score.of(value as number);
  return built.ok ? built : err(ruleText(built.error, value));
}

// Builds one result of a sync body. The first broken rule in the order of
// the fields gives the text: the levelId, the stars, the moves, the time.
export function levelResultFrom(
  fields: Readonly<Record<string, unknown>>,
): Result<LevelResult, string> {
  const built = buildLevelResult(fields as unknown as LevelResultValues);
  return built.ok ? built : err(ruleText(built.error, fields[RESULT_FIELDS[built.error]]));
}

// The text of each rule. It shows the value that broke the rule, as the
// client sent it.
function ruleText(
  problem: GameIdProblem | ScoreProblem | LevelResultProblem,
  value: unknown,
): string {
  switch (problem) {
    case 'invalid-game-id':
      return `gameId must be a lowercase slug, got ${JSON.stringify(value)}.`;
    case 'invalid-level-id':
      return 'levelId must be a non-blank string.';
    case 'invalid-score':
      return `score must be a non-negative integer, got ${String(value)}.`;
    case 'invalid-stars':
      return `stars must be a non-negative integer, got ${String(value)}.`;
    case 'invalid-moves':
      return `moves must be a non-negative integer, got ${String(value)}.`;
    case 'invalid-elapsed-time':
      return `elapsedMs must be a non-negative integer, got ${String(value)}.`;
  }
}
