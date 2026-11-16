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

  // Tells if two cells hold as many values. A topology reads a cell only when
  // it has the length of the cells of that topology.
  hasSameLengthAs(other: Coordinate): boolean {
    return this.values.length === other.values.length;
  }

  // Gives the cell that this cell becomes when it moves by an offset: each
  // value plus the value of the offset at the same place. A topology checks
  // the length of each cell first, so another length is a defect of the code.
  movedBy(offset: Coordinate): Coordinate {
    if (!this.hasSameLengthAs(offset)) {
      throw new RangeError('A cell moves only by an offset of its own length.');
    }
    return new Coordinate(
      Object.freeze(this.values.map((value, index) => value + offset.values[index])),
    );
  }

  // Gives the cell that this cell becomes after one rotation step of a
  // topology. `turnedUnits` holds where the step takes each unit cell: first
  // [1, 0, ...], then [0, 1, ...], and so on. The turned cell adds each turned
  // unit cell times the value of this cell at its place. For example, the hex
  // step takes [1, 0] to [0, 1] and [0, 1] to [-1, 1], so [q, r] becomes
  // [-r, q + r]. Cells of another length are a defect of the code.
  turnedBy(turnedUnits: readonly Coordinate[]): Coordinate {
    if (
      turnedUnits.length !== this.values.length ||
      !turnedUnits.every((unit) => unit.hasSameLengthAs(this))
    ) {
      throw new RangeError(
        'A cell turns only by one turned unit cell per value, each of its length.',
      );
    }
    const turned = this.values.map((_, place) =>
      turnedUnits.reduce((sum, unit, index) => sum + unit.values[place] * this.values[index], 0),
    );
    return new Coordinate(Object.freeze(turned));
  }
}
