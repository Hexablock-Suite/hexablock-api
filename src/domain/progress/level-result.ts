import { ElapsedTime } from './elapsed-time.js';
import { LevelId } from './level-id.js';
import { Moves } from './moves.js';
import { Stars } from './stars.js';

// The plain values of one level result, as a row or a JSON body holds them.
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
    readonly levelId: LevelId,
    readonly stars: Stars,
    readonly moves: Moves,
    readonly elapsedTime: ElapsedTime,
  ) {}

  // Each value object checks its own rule, in the order of the fields.
  static of(values: LevelResultValues): LevelResult {
    return new LevelResult(
      LevelId.of(values.levelId),
      Stars.of(values.stars),
      Moves.of(values.moves),
      ElapsedTime.ofMs(values.elapsedMs),
    );
  }

  // Two results are equal when every field is equal.
  equals(other: LevelResult): boolean {
    return (
      this.isForSameLevelAs(other) &&
      this.stars.equals(other.stars) &&
      this.moves.equals(other.moves) &&
      this.elapsedTime.equals(other.elapsedTime)
    );
  }

  isForSameLevelAs(other: LevelResult): boolean {
    return this.levelId.equals(other.levelId);
  }

  // The order of DS-4: more stars wins, then fewer moves, then less time. A
  // full tie is not better, so the caller keeps the result it has.
  isBetterThan(other: LevelResult): boolean {
    if (!this.stars.equals(other.stars)) {
      return this.stars.isMoreThan(other.stars);
    }
    if (!this.moves.equals(other.moves)) {
      return this.moves.isFewerThan(other.moves);
    }
    return this.elapsedTime.isShorterThan(other.elapsedTime);
  }
}
