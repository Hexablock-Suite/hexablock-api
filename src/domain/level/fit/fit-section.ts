import { ok, type Result } from '../../shared/result.js';
import { Coordinate } from '../coordinate.js';
import type { LevelProblem } from '../level-problem.js';
import { readFields, readList, sameItems } from '../parts.js';
import { FitPiece } from './fit-piece.js';
import { FitStarThreshold } from './fit-star-threshold.js';
import { Placement } from './placement.js';

// Value object for the section of a Fit level (DS-6): the figure, the pieces,
// the witness and the star thresholds. It checks its own shape when it is
// created, so isSection() is gone. It holds the rules of the section too: the
// A5 check of #79 joins them here, and FitLevelValidator only picks this type.
export class FitSection {
  private constructor(
    private readonly figure: readonly Coordinate[],
    private readonly pieces: readonly FitPiece[],
    private readonly witness: readonly Placement[],
    private readonly stars: readonly FitStarThreshold[],
  ) {}

  // Reads { figure, pieces, witness, stars } from the section as it arrives.
  // Each field is a list of one item or more. A wrong field gives its own
  // level problem, so the border can name the field.
  static of(raw: unknown): Result<FitSection, LevelProblem> {
    const section = readFields(
      raw,
      {
        figure: (value) => readList(value, (cell) => Coordinate.of(cell), 'invalid-figure'),
        pieces: (value) => readList(value, (piece) => FitPiece.of(piece), 'invalid-pieces'),
        witness: (value) => readList(value, (entry) => Placement.of(entry), 'invalid-witness'),
        stars: (value) => readList(value, (star) => FitStarThreshold.of(star), 'invalid-stars'),
      },
      'invalid-section',
    );
    if (!section.ok) {
      return section;
    }
    const { figure, pieces, witness, stars } = section.value;
    return ok(new FitSection(figure, pieces, witness, stars));
  }

  // Two sections are equal when each field holds equal items in the same order.
  equals(other: FitSection): boolean {
    return (
      sameItems(this.figure, other.figure, (cell, otherCell) => cell.equals(otherCell)) &&
      sameItems(this.pieces, other.pieces, (piece, otherPiece) => piece.equals(otherPiece)) &&
      sameItems(this.witness, other.witness, (entry, otherEntry) => entry.equals(otherEntry)) &&
      sameItems(this.stars, other.stars, (star, otherStar) => star.equals(otherStar))
    );
  }
}
