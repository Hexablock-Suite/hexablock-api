import type { ElapsedTime } from './elapsed-time.js';
import type { LevelId } from './level-id.js';
import type { Moves } from './moves.js';
import type { Stars } from './stars.js';

// The receiver of the four values of a LevelResult. LevelResult.deliverTo()
// calls it once. Only the border implements it, for example a row mapper.
export interface LevelResultReceiver {
  receive(levelId: LevelId, stars: Stars, moves: Moves, elapsedTime: ElapsedTime): void;
}

// Value object for the result of one level. It has no userId and no gameId:
// the PlayerProgress aggregate that keeps it gives both (classes.md decision 2).
export class LevelResult {
  private constructor(
    private readonly levelId: LevelId,
    private readonly stars: Stars,
    private readonly moves: Moves,
    private readonly elapsedTime: ElapsedTime,
  ) {}

  // Each value object guards its own rule. The border builds them, so the
  // factory checks nothing more.
  static of(levelId: LevelId, stars: Stars, moves: Moves, elapsedTime: ElapsedTime): LevelResult {
    return new LevelResult(levelId, stars, moves, elapsedTime);
  }

  // Delivers the four values to a receiver of the border. No operation returns them.
  deliverTo(receiver: LevelResultReceiver): void {
    receiver.receive(this.levelId, this.stars, this.moves, this.elapsedTime);
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

  // Tells if this result is a play of the level with this levelId (#135).
  isFor(levelId: LevelId): boolean {
    return this.levelId.equals(levelId);
  }

  // Tells if this result carries more stars than a level allows (DS-6, #135).
  hasMoreStarsThan(most: Stars): boolean {
    return this.stars.isMoreThan(most);
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
