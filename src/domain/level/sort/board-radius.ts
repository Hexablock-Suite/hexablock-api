import { err, ok, type Result } from '../../shared/result.js';
import type { ValueReceiver } from '../../shared/value-receiver.js';
import type { LevelProblem } from '../level-problem.js';

// Value object for the radius of the board of a Sort level. The board holds
// every cell at a distance of the radius or less from its center: on the hex
// topology, the radius 2 gives the 19 cells of the statement. A radius is a
// safe integer of 1 or more.
export class BoardRadius {
  private constructor(private readonly value: number) {}

  // The raw value comes from the raw section of a level, so the factory checks its type.
  static of(raw: unknown): Result<BoardRadius, LevelProblem> {
    return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 1
      ? ok(new BoardRadius(raw))
      : err('invalid-radius');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }

  equals(other: BoardRadius): boolean {
    return this.value === other.value;
  }
}
