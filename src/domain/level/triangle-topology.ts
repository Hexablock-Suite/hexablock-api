import type { Result } from '../shared/result.js';
import { Coordinate } from './coordinate.js';
import { Rotation } from './fit/rotation.js';
import type { LevelProblem } from './level-problem.js';
import type { Topology } from './topology.js';

// The value of a constant of this file. The constants are fixed, so a failed
// Result is a defect of the code.
function fixed<T>(result: Result<T, LevelProblem>): T {
  if (!result.ok) {
    throw new RangeError(`A constant of the triangle topology breaks the rule ${result.error}.`);
  }
  return result.value;
}

// A triangle cell has two values, as the origin does.
const ORIGIN = fixed(Coordinate.of([0, 0]));

// One step is a sixth of a turn around the vertex at the origin. It is
// [col - 3·row + 2, col + row] / 2 for a cell that points up, and
// [col - 3·row + 3, col + row - 1] / 2 for a cell that points down. The
// linear part takes the unit cell [1, 0] to [1, 1] and the unit cell [0, 1]
// to [-3, 1]. Each sum is even, so the half is a whole cell.
const TWICE_THE_STEP = [fixed(Coordinate.of([1, 1])), fixed(Coordinate.of([-3, 1]))];
const UP_SHIFT = fixed(Coordinate.of([2, 0]));
const DOWN_SHIFT = fixed(Coordinate.of([3, -1]));

// Six steps make a full turn.
const FULL_TURN = fixed(Rotation.of(6));

// An offset counts lattice cells. One step of col is two triangles to the
// right, so the unit cell [1, 0] moves by [2, 0]. One step of row is one row
// down and one triangle to the right, so the unit cell [0, 1] moves by [1, 1].
const LATTICE_STEP = [fixed(Coordinate.of([2, 0])), fixed(Coordinate.of([1, 1]))];

// The triangle topology of docs/level-format.md, with the rules of
// TriangleTopology in the app. A cell is [col, row], and it points up when
// col + row is even. One rotation step turns a cell a sixth of a turn around
// the vertex at the origin, so six steps of 60° make a full turn (A5). Each
// step flips the orientation of the cell, so no cell keeps its place. A move
// adds the offset in lattice cells, [col + 2·at.col + at.row, row + at.row],
// so it keeps the orientation of each cell. A plain sum of the values would
// flip a cell when the offset sum is odd.
export class TriangleTopology implements Topology {
  holds(cell: Coordinate): boolean {
    return cell.hasSameLengthAs(ORIGIN);
  }

  turn(cell: Coordinate, rotation: Rotation): Coordinate {
    return rotation.turn(cell, (turned) => this.stepOf(turned), FULL_TURN);
  }

  move(cell: Coordinate, at: Coordinate): Coordinate {
    return cell.movedBy(at.turnedBy(LATTICE_STEP));
  }

  // Turns a cell by one step. The shift depends on the orientation of the cell.
  private stepOf(cell: Coordinate): Coordinate {
    const shift = cell.hasEvenSum() ? UP_SHIFT : DOWN_SHIFT;
    return cell.turnedBy(TWICE_THE_STEP).movedBy(shift).halved();
  }
}
