import { ElapsedTime, type ElapsedTimeProblem } from '../domain/progress/elapsed-time.js';
import { LevelId, type LevelIdProblem } from '../domain/progress/level-id.js';
import { LevelResult } from '../domain/progress/level-result.js';
import { Moves, type MovesProblem } from '../domain/progress/moves.js';
import { Stars, type StarsProblem } from '../domain/progress/stars.js';
import { ok, type Result } from '../domain/shared/result.js';
import type { LevelResultValues } from './received.js';

// The helpers of the border that build domain values from plain values, as
// a row or a JSON body keeps them. The factory of each value object returns
// a Result (decision 11), so a helper gives the first failed Result or the
// built value. The mirror helpers that receive the values are in received.ts.

// The code of the first rule that the values of a level result break.
export type LevelResultProblem = LevelIdProblem | StarsProblem | MovesProblem | ElapsedTimeProblem;

// Builds the four value objects of one level result in the order of the
// fields: the levelId, the stars, the moves, then the time. The first broken
// rule stops the build. LevelResult.of() takes the four built (decision 3).
// The type of each field is what a row keeps. A JSON body can hold any type,
// and each factory checks the type of its value.
export function buildLevelResult({
  levelId,
  stars,
  moves,
  elapsedMs,
}: LevelResultValues): Result<LevelResult, LevelResultProblem> {
  const builtLevelId = LevelId.of(levelId);
  if (!builtLevelId.ok) return builtLevelId;
  const builtStars = Stars.of(stars);
  if (!builtStars.ok) return builtStars;
  const builtMoves = Moves.of(moves);
  if (!builtMoves.ok) return builtMoves;
  const builtTime = ElapsedTime.ofMs(elapsedMs);
  if (!builtTime.ok) return builtTime;
  return ok(
    LevelResult.of(builtLevelId.value, builtStars.value, builtMoves.value, builtTime.value),
  );
}
