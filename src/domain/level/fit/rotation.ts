import { err, ok, type Result } from '../../shared/result.js';
import type { ValueReceiver } from '../../shared/value-receiver.js';
import type { LevelProblem } from '../level-problem.js';

// Value object for the rotation of a piece in the witness of a Fit level: a
// count of rotation steps of the level topology, never degrees (A5). The hex
// topology has six steps of 60°. A negative count turns the other way.
export class Rotation {
  private constructor(private readonly steps: number) {}

  // The raw value comes from the raw section of a level, so the factory
  // checks its type. A rotation is a safe integer. A negative zero is stored as 0.
  static of(raw: unknown): Result<Rotation, LevelProblem> {
    return typeof raw === 'number' && Number.isSafeInteger(raw)
      ? ok(new Rotation(0 + raw))
      : err('invalid-rotation');
  }

  // Delivers the count to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.steps);
  }

  // Two rotations are equal when they hold the same count. Only the topology
  // knows its full turn, so 6 and 0 are two rotations here.
  equals(other: Rotation): boolean {
    return this.steps === other.steps;
  }
}
