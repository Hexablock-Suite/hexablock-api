import { GameId, type GameIdProblem } from '../../domain/progress/game-id.js';
import { INCOMING_ID_LENGTH } from '../../domain/progress/incoming-id-length.js';
import { LevelId } from '../../domain/progress/level-id.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import { MOST_MOVES_OF_ONE_PLAY, Moves } from '../../domain/progress/moves.js';
import { Score, type ScoreProblem } from '../../domain/progress/score.js';
import { MOST_STARS_OF_ONE_PLAY, Stars } from '../../domain/progress/stars.js';
import { err, type Result } from '../../domain/shared/result.js';
import { buildLevelResult, type LevelResultProblem } from '../built.js';
import { type LevelResultValues, receiveBoundValuesOf, receiveValueOf } from '../received.js';

// Builds the progress values of a request: a JSON body or a path. The
// factory of each value object returns a Result with the code of the broken
// rule, and this module writes the text of that rule (decision 11). The
// texts name the fields of the JSON body, so they live here and not in the
// domain. Each 400 body keeps them word for word. ProgressDtoMapper,
// LevelDtoMapper and LeaderboardDtoMapper share them.

// The bounds of a value that a client sends (#135). The domain delivers
// them, so the messages and the OpenAPI limits name the same numbers.
export const INCOMING_ID_BOUNDS = receiveBoundValuesOf(INCOMING_ID_LENGTH);
export const MOST_STARS = receiveValueOf(MOST_STARS_OF_ONE_PLAY);
export const MOST_MOVES = receiveValueOf(MOST_MOVES_OF_ONE_PLAY);

// The field of a level result that each code names.
const RESULT_FIELDS = {
  'invalid-level-id': 'levelId',
  'invalid-stars': 'stars',
  'invalid-moves': 'moves',
  'invalid-elapsed-time': 'elapsedMs',
} as const satisfies Record<LevelResultProblem, keyof LevelResultValues>;

// The value of a request can have any type. Each factory checks the type of
// its value, so the casts only satisfy the signature of the factory. A
// request brings an incoming value, so each id takes the bounds of
// ofIncoming() (#135).
export function gameIdFrom(value: unknown): Result<GameId, string> {
  const built = GameId.ofIncoming(value as string);
  return built.ok ? built : err(ruleText(built.error, value));
}

export function levelIdFrom(value: unknown): Result<LevelId, string> {
  const built = LevelId.ofIncoming(value as string);
  return built.ok ? built : err(ruleText(built.error, value));
}

export function scoreFrom(value: unknown): Result<Score, string> {
  const built = Score.of(value as number);
  return built.ok ? built : err(ruleText(built.error, value));
}

// Builds one result of a sync body. The first broken rule in the order of
// the fields gives the text: the levelId, the stars, the moves, the time.
// buildLevelResult() builds a result with the rules of a stored row, so the
// bounds of an incoming play run first, in the same order (#135).
export function levelResultFrom(
  fields: Readonly<Record<string, unknown>>,
): Result<LevelResult, string> {
  const values = fields as unknown as LevelResultValues;
  const incoming = incomingProblemOf(values);
  if (incoming !== undefined) {
    return err(ruleText(incoming, fields[RESULT_FIELDS[incoming]]));
  }
  const built = buildLevelResult(values);
  return built.ok ? built : err(ruleText(built.error, fields[RESULT_FIELDS[built.error]]));
}

// The code of the first incoming bound that the values of one play break,
// in the order of the fields, or undefined. The time has no incoming bound,
// so buildLevelResult() checks it.
function incomingProblemOf({
  levelId,
  stars,
  moves,
}: LevelResultValues): LevelResultProblem | undefined {
  const checks: readonly Result<unknown, LevelResultProblem>[] = [
    LevelId.ofIncoming(levelId),
    Stars.ofIncoming(stars),
    Moves.ofIncoming(moves),
  ];
  for (const check of checks) {
    if (!check.ok) return check.error;
  }
  return undefined;
}

// The text of each rule. It shows the value that broke the rule, as the
// client sent it.
function ruleText(
  problem: GameIdProblem | ScoreProblem | LevelResultProblem,
  value: unknown,
): string {
  switch (problem) {
    case 'invalid-game-id':
      return `gameId must be a lowercase slug of ${INCOMING_ID_BOUNDS.min} to ${INCOMING_ID_BOUNDS.max} characters, got ${JSON.stringify(value)}.`;
    case 'invalid-level-id':
      return `levelId must be a non-blank string of ${INCOMING_ID_BOUNDS.min} to ${INCOMING_ID_BOUNDS.max} characters with no control character.`;
    case 'invalid-score':
      return `score must be a non-negative integer, got ${String(value)}.`;
    case 'invalid-stars':
      return `stars must be a non-negative integer of at most ${MOST_STARS}, got ${String(value)}.`;
    case 'invalid-moves':
      return `moves must be a non-negative integer of at most ${MOST_MOVES}, got ${String(value)}.`;
    case 'invalid-elapsed-time':
      return `elapsedMs must be a non-negative integer, got ${String(value)}.`;
  }
}
