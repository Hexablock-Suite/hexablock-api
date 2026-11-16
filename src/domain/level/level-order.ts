import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';
import type { LevelProblem } from './level-problem.js';

// Value object for the place of a level in the list of its game (DS-6). The
// first level has the order 1. An order is a safe integer of 1 or more.
export class LevelOrder {
  private constructor(private readonly value: number) {}

  static of(value: number): Result<LevelOrder, LevelProblem> {
    return Number.isSafeInteger(value) && value >= 1
      ? ok(new LevelOrder(value))
      : err('invalid-order');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }

  equals(other: LevelOrder): boolean {
    return this.value === other.value;
  }
}
