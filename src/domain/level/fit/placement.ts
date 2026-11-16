import { ok, type Result } from '../../shared/result.js';
import { Coordinate } from '../coordinate.js';
import type { LevelProblem } from '../level-problem.js';
import { readFields } from '../parts.js';
import type { Topology } from '../topology.js';
import type { ValueReceiver } from '../../shared/value-receiver.js';
import type { FitPiece } from './fit-piece.js';
import { PieceId } from './piece-id.js';
import { Rotation } from './rotation.js';

// Value object for one entry of the witness of a Fit level, the solution of
// the designer (A5): the piece, its rotation and the offset where it lies.
// The piece turns around its own origin first, and then it moves by the offset.
export class Placement {
  private constructor(
    private readonly piece: PieceId,
    private readonly rotation: Rotation,
    private readonly at: Coordinate,
  ) {}

  // Reads { piece, rotation, at }.
  static of(raw: unknown): Result<Placement, LevelProblem> {
    const placement = readFields(
      raw,
      {
        piece: (value) => PieceId.of(value),
        rotation: (value) => Rotation.of(value),
        at: (value) => Coordinate.of(value),
      },
      'invalid-placement',
    );
    return placement.ok
      ? ok(new Placement(placement.value.piece, placement.value.rotation, placement.value.at))
      : placement;
  }

  // Delivers the piece, the rotation and the offset to a receiver of the
  // border, the mirror of of(). No operation returns them.
  deliverTo(
    receiver: ValueReceiver<{
      readonly piece: PieceId;
      readonly rotation: Rotation;
      readonly at: Coordinate;
    }>,
  ): void {
    receiver.receive({ piece: this.piece, rotation: this.rotation, at: this.at });
  }

  // Two placements are equal when they have the same piece, rotation and offset.
  equals(other: Placement): boolean {
    return (
      this.piece.equals(other.piece) &&
      this.rotation.equals(other.rotation) &&
      this.at.equals(other.at)
    );
  }

  // Tells if this entry places the piece: the entry names the id of the piece.
  places(piece: FitPiece): boolean {
    return piece.isNamed(this.piece);
  }

  // Tells if the offset is a cell of the topology.
  isOn(topology: Topology): boolean {
    return topology.holds(this.at);
  }

  // Gives the cells that the piece covers in this entry: the piece turns by
  // the rotation of the entry, and then it moves by its offset (A5).
  coveredCells(piece: FitPiece, topology: Topology): readonly Coordinate[] {
    return piece.coveredCells(this.rotation, this.at, topology);
  }
}
