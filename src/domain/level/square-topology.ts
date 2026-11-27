import type { Result } from '../shared/result.js';
import { Coordinate } from './coordinate.js';
import type { LevelProblem } from './level-problem.js';
import { Rotation } from './rotation.js';
import type { Topology } from './topology.js';

// The value of a constant of this file. The constants are fixed, so a failed
// Result is a defect of the code.
function fixed<T>(result: Result<T, LevelProblem>): T {
  if (!result.ok) {
    throw new RangeError(`A constant of the square topology breaks the rule ${result.error}.`);
  }
  return result.value;
}

// A square cell has two values, as the origin does.
const ORIGIN = fixed(Coordinate.of([0, 0]));

// One step is a quarter turn around the origin. It takes the unit cell
// [1, 0] to [0, 1] and the unit cell [0, 1] to [-1, 0].
const ONE_STEP = [fixed(Coordinate.of([0, 1])), fixed(Coordinate.of([-1, 0]))];

// Four steps make a full turn.
const FULL_TURN = fixed(Rotation.of(4));

// The square topology of docs/level-format.md, with the rules of
// SquareTopology in the app. A cell is [col, row]. One rotation step turns
// [col, row] to [-row, col], so four steps of 90° make a full turn (A5). A
// move adds the offset one value at a time.
export class SquareTopology implements Topology {
  holds(cell: Coordinate): boolean {
    return cell.hasSameLengthAs(ORIGIN);
  }

  turn(cell: Coordinate, rotation: Rotation): Coordinate {
    return rotation.turn(cell, (turned) => turned.turnedBy(ONE_STEP), FULL_TURN);
  }

  move(cell: Coordinate, at: Coordinate): Coordinate {
    return cell.movedBy(at);
  }
}
