import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The code of the broken rule. The border writes the message.
export type LevelsCompletedProblem = 'invalid-levels-completed';

// Value object for the number of levels of one game that a player completed
// (S3-03). A level counts when the player has a stored result for it. The
// progress keeps one result per level (DS-12), so a level counts once. The
// count is a non-negative safe integer.
export class LevelsCompleted {
  private constructor(private readonly value: number) {}

  static of(value: number): Result<LevelsCompleted, LevelsCompletedProblem> {
    return Number.isSafeInteger(value) && value >= 0
      ? ok(new LevelsCompleted(value))
      : err('invalid-levels-completed');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }

  equals(other: LevelsCompleted): boolean {
    return this.value === other.value;
  }

  // More levels completed is the better standing (S3-03). An equal count is not more.
  isMoreThan(other: LevelsCompleted): boolean {
    return this.value > other.value;
  }

  // Tells if the player completed no level of the game.
  isNone(): boolean {
    return this.value === 0;
  }
}
