import { ok, type Result } from '../../shared/result.js';
import { Coordinate } from '../coordinate.js';
import type { LevelProblem } from '../level-problem.js';
import { readFields, readList, sameItems } from '../parts.js';
import type { Topology } from '../topology.js';
import { PieceId } from './piece-id.js';
import type { Rotation } from './rotation.js';

// Value object for one piece of a Fit level: its id and its cells. Each cell
// is relative to the origin of the piece, so a placement turns the piece
// around that origin and then moves it.
export class FitPiece {
  private constructor(
    private readonly id: PieceId,
    private readonly cells: readonly Coordinate[],
  ) {}

  // Reads { id, cells }. The cells are a list of one coordinate or more.
  static of(raw: unknown): Result<FitPiece, LevelProblem> {
    const piece = readFields(
      raw,
      {
        id: (value) => PieceId.of(value),
        cells: (value) => readList(value, (cell) => Coordinate.of(cell), 'invalid-piece'),
      },
      'invalid-piece',
    );
    return piece.ok ? ok(new FitPiece(piece.value.id, piece.value.cells)) : piece;
  }

  // Two pieces are equal when they have the same id and the same cells in the same order.
  equals(other: FitPiece): boolean {
    return (
      this.id.equals(other.id) &&
      sameItems(this.cells, other.cells, (cell, otherCell) => cell.equals(otherCell))
    );
  }

  // Tells if the piece has this id. The witness names each piece by its id.
  isNamed(id: PieceId): boolean {
    return this.id.equals(id);
  }

  // Tells if each cell of the piece is a cell of the topology.
  isOn(topology: Topology): boolean {
    return this.cells.every((cell) => topology.holds(cell));
  }

  // Gives the cells that the piece covers when it turns around its origin by
  // `rotation` steps of the topology and then moves by `at` (A5). Each cell
  // of the piece must be a cell of the topology.
  coveredCells(rotation: Rotation, at: Coordinate, topology: Topology): readonly Coordinate[] {
    return this.cells.map((cell) => topology.turn(cell, rotation).movedBy(at));
  }
}
