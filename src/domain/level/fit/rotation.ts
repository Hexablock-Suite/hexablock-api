import { err, ok, type Result } from '../../shared/result.js';
import type { ValueReceiver } from '../../shared/value-receiver.js';
import type { Coordinate } from '../coordinate.js';
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

  // Turns a cell by this count of steps of a topology. `step` turns a cell by
  // one step, and `fullTurn` counts the steps of one full turn. Whole turns
  // change no cell, so the cell turns only by the steps that are left. A
  // negative count turns the other way: -1 is the same as a full turn less
  // one step. So a turn never runs more steps than a full turn.
  turn(cell: Coordinate, step: (cell: Coordinate) => Coordinate, fullTurn: Rotation): Coordinate {
    const left = ((this.steps % fullTurn.steps) + fullTurn.steps) % fullTurn.steps;
    let turned = cell;
    for (let done = 0; done < left; done += 1) {
      turned = step(turned);
    }
    return turned;
  }
}
