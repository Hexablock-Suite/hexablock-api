import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The code of the broken rule. The border writes the message (decision 11).
export type ElapsedTimeProblem = 'invalid-elapsed-time';

// Value object for the time that a player takes in one level, in milliseconds. It is a non-negative
// safe integer.
export class ElapsedTime {
  private constructor(private readonly value: number) {}

  static ofMs(value: number): Result<ElapsedTime, ElapsedTimeProblem> {
    return Number.isSafeInteger(value) && value >= 0
      ? ok(new ElapsedTime(value))
      : err('invalid-elapsed-time');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }

  equals(other: ElapsedTime): boolean {
    return this.value === other.value;
  }

  // Less time is the better result (DS-4). An equal time is not shorter.
  isShorterThan(other: ElapsedTime): boolean {
    return this.value < other.value;
  }
}
