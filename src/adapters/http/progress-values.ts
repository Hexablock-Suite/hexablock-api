import { GameId, type GameIdProblem } from '../../domain/progress/game-id.js';
import { LevelId } from '../../domain/progress/level-id.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import { Moves } from '../../domain/progress/moves.js';
import { Score, type ScoreProblem } from '../../domain/progress/score.js';
import { Stars } from '../../domain/progress/stars.js';
import { err, type Result } from '../../domain/shared/result.js';
import { buildLevelResult, type LevelResultProblem } from '../built.js';
import { type Bounds, type LevelResultValues } from '../received.js';

// Builds the progress values of a request: a JSON body or a path. The
// factory of each value object returns a Result with the code of the broken
// rule, and this module writes the text of that rule (decision 11). The
// texts name the fields of the JSON body, so they live here and not in the
// domain. Each 400 body keeps them word for word. ProgressDtoMapper,
// LevelDtoMapper and LeaderboardDtoMapper share them.

// The bounds of a value that a client sends (#135, moved here by #179).
// The columns are Postgres text and set no length, so 1 to 64 characters
// is a choice of the API: a slug such as hexa-fit or an id such as fit-01
// needs far fewer characters. The numbers of the stars and the moves are
// the largest value of the Postgres integer columns level_results.stars
// and level_results.moves. The DTOs publish them as the OpenAPI limits,
// and the texts of the rules name them, so the numbers live here.
export const INCOMING_ID_BOUNDS: Readonly<Bounds<number>> = { min: 1, max: 64 };
export const MOST_STARS = 2_147_483_647;
export const MOST_MOVES = 2_147_483_647;

// The field of a level result that each code names.
const RESULT_FIELDS = {
  'invalid-level-id': 'levelId',
  'invalid-stars': 'stars',
  'invalid-moves': 'moves',
  'invalid-elapsed-time': 'elapsedMs',
} as const satisfies Record<LevelResultProblem, keyof LevelResultValues>;

// The number of code points of a text: a character is one code point, so an
// emoji counts once (#135).
function codePointsOf(value: string): number {
  return Array.from(value).length;
}

// An id of a client holds 1 to 64 characters (#135). A stored row keeps
// what it holds, so of() of the domain keeps no such bound.
function fitsIdColumn(value: string): boolean {
  const count = codePointsOf(value);
  return count >= INCOMING_ID_BOUNDS.min && count <= INCOMING_ID_BOUNDS.max;
}

// A control character is U+0000 to U+001F or U+007F: Postgres rejects
// U+0000 in a text column (#135).
function holdsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}

// The value of a request can have any type. Each builder checks the rules
// of its value: the rules of the domain factory first, and then the bounds
// of the columns, which live here (#179).
export function gameIdFrom(value: unknown): Result<GameId, string> {
  const built = GameId.of(value as string);
  return built.ok && fitsIdColumn(value as string)
    ? built
    : err(ruleText('invalid-game-id', value));
}

export function levelIdFrom(value: unknown): Result<LevelId, string> {
  const built = LevelId.of(value as string);
  return built.ok && fitsIdColumn(value as string) && !holdsControlCharacter(value as string)
    ? built
    : err(ruleText('invalid-level-id', value));
}

export function scoreFrom(value: unknown): Result<Score, string> {
  const built = Score.of(value as number);
  return built.ok ? built : err(ruleText(built.error, value));
}

export function starsFrom(value: unknown): Result<Stars, string> {
  const built = Stars.of(value as number);
  return built.ok && (value as number) <= MOST_STARS
    ? built
    : err(ruleText('invalid-stars', value));
}

export function movesFrom(value: unknown): Result<Moves, string> {
  const built = Moves.of(value as number);
  return built.ok && (value as number) <= MOST_MOVES
    ? built
    : err(ruleText('invalid-moves', value));
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
  if (!levelIdFrom(levelId).ok) return 'invalid-level-id';
  if (!starsFrom(stars).ok) return 'invalid-stars';
  if (!movesFrom(moves).ok) return 'invalid-moves';
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
