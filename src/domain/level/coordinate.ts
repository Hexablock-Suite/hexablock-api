import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';
import type { LevelProblem } from './level-problem.js';

// Value object for one cell of a level: a list of whole numbers. The
// `topology` of the level says how to read the list (decision 6). The hex
// topology reads [q, r] as axial coordinates, and a 3D topology reads three
// values. So a new topology needs no new schema.
export class Coordinate {
  private constructor(private readonly values: readonly number[]) {}

  // The raw value comes from the raw section of a level, so the factory
  // checks its type. A coordinate is a list of one safe integer or more. A
  // negative zero is stored as 0, so two equal cells deliver the same list.
  static of(raw: unknown): Result<Coordinate, LevelProblem> {
    if (
      !Array.isArray(raw) ||
      raw.length === 0 ||
      !raw.every((value) => Number.isSafeInteger(value))
    ) {
      return err('invalid-coordinate');
    }
    return ok(new Coordinate(Object.freeze((raw as number[]).map((value) => 0 + value))));
  }

  // Delivers a copy of the values to a receiver of the border. No operation
  // returns them.
  deliverTo(receiver: ValueReceiver<readonly number[]>): void {
    receiver.receive([...this.values]);
  }

  // Two coordinates are equal when they hold the same values in the same order.
  equals(other: Coordinate): boolean {
    return (
      this.values.length === other.values.length &&
      this.values.every((value, index) => value === other.values[index])
    );
  }
}
