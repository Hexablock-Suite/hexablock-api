import { ProgressError } from './progress-error.js';

export interface LevelResultValues {
  levelId: string;
  stars: number;
  moves: number;
  elapsedMs: number;
}

// Value object for the result of one level. It has no userId and no gameId:
// the PlayerProgress aggregate that keeps it gives both (classes.md decision 2).
export class LevelResult {
  private constructor(
    readonly levelId: string,
    readonly stars: number,
    readonly moves: number,
    readonly elapsedMs: number,
  ) {}

  static of(values: LevelResultValues): LevelResult {
    const { levelId, stars, moves, elapsedMs } = values;
    if (typeof levelId !== 'string' || levelId.trim() === '') {
      throw new ProgressError('levelId must be a non-blank string.');
    }
    for (const [field, count] of Object.entries({ stars, moves, elapsedMs })) {
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new ProgressError(`${field} must be a non-negative integer, got ${count}.`);
      }
    }
    return new LevelResult(levelId, stars, moves, elapsedMs);
  }
}
