import { err, ok, type Result } from '../../shared/result.js';
import type { ValueReceiver } from '../../shared/value-receiver.js';
import type { LevelProblem } from '../level-problem.js';

// Value object for the goal of a Sort level: the count of stacks that the
// player clears to win. A goal of 0 wins before the first move (app D21), so
// a goal is a safe integer of 1 or more.
export class GoalCount {
  private constructor(private readonly value: number) {}

  // The raw value comes from the raw section of a level, so the factory checks its type.
  static of(raw: unknown): Result<GoalCount, LevelProblem> {
    return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 1
      ? ok(new GoalCount(raw))
      : err('invalid-goals');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }

  equals(other: GoalCount): boolean {
    return this.value === other.value;
  }
}
