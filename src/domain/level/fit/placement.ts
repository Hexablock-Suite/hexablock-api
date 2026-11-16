import { ok, type Result } from '../../shared/result.js';
import { Coordinate } from '../coordinate.js';
import type { LevelProblem } from '../level-problem.js';
import { readFields } from '../parts.js';
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

  // Two placements are equal when they have the same piece, rotation and offset.
  equals(other: Placement): boolean {
    return (
      this.piece.equals(other.piece) &&
      this.rotation.equals(other.rotation) &&
      this.at.equals(other.at)
    );
  }
}
