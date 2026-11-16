import { err, ok, type Result } from '../shared/result.js';
import type { ElapsedTime } from './elapsed-time.js';
import type { LevelsCompleted } from './levels-completed.js';
import type { Moves } from './moves.js';
import type { Stars } from './stars.js';

// The code of the broken rule. The border writes the message.
export type StandingProblem = 'no-level-completed';

// The receiver of the four totals of a Standing. Standing.deliverTo() calls
// it once. Only the border implements it, for example a DTO mapper.
export interface StandingReceiver {
  receive(
    stars: Stars,
    levelsCompleted: LevelsCompleted,
    moves: Moves,
    elapsedTime: ElapsedTime,
  ): void;
}

// Value object for the totals of one player over the levels of one game that
// the player completed: the stars, the count of levels, the moves and the
// time. A total of stars, moves or time uses the value object of one level
// result. Standing holds the order of the global board of Fit and Sort (S3-03).
export class Standing {
  private constructor(
    private readonly stars: Stars,
    private readonly levelsCompleted: LevelsCompleted,
    private readonly moves: Moves,
    private readonly elapsedTime: ElapsedTime,
  ) {}

  // A standing ranks a player who completed at least one level of the game.
  static of(
    stars: Stars,
    levelsCompleted: LevelsCompleted,
    moves: Moves,
    elapsedTime: ElapsedTime,
  ): Result<Standing, StandingProblem> {
    return levelsCompleted.isNone()
      ? err('no-level-completed')
      : ok(new Standing(stars, levelsCompleted, moves, elapsedTime));
  }

  // Delivers the four totals to a receiver of the border. No operation returns them.
  deliverTo(receiver: StandingReceiver): void {
    receiver.receive(this.stars, this.levelsCompleted, this.moves, this.elapsedTime);
  }

  // Two standings are equal when every total is equal.
  equals(other: Standing): boolean {
    return (
      this.stars.equals(other.stars) &&
      this.levelsCompleted.equals(other.levelsCompleted) &&
      this.moves.equals(other.moves) &&
      this.elapsedTime.equals(other.elapsedTime)
    );
  }

  // The order of S3-03: more stars wins, then more levels completed, then
  // fewer moves, then less time. A full tie is not better.
  isBetterThan(other: Standing): boolean {
    if (!this.stars.equals(other.stars)) {
      return this.stars.isMoreThan(other.stars);
    }
    if (!this.levelsCompleted.equals(other.levelsCompleted)) {
      return this.levelsCompleted.isMoreThan(other.levelsCompleted);
    }
    if (!this.moves.equals(other.moves)) {
      return this.moves.isFewerThan(other.moves);
    }
    return this.elapsedTime.isShorterThan(other.elapsedTime);
  }
}
