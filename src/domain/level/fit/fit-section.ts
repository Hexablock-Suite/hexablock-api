import { err, ok, type Result } from '../../shared/result.js';
import { Coordinate } from '../coordinate.js';
import type { LevelProblem } from '../level-problem.js';
import { type LevelSection, mostStarsOf } from '../level-section.js';
import type { Stars } from '../../progress/stars.js';
import type { ValueReceiver } from '../../shared/value-receiver.js';
import { readFields, readList, sameItems } from '../parts.js';
import type { Topology } from '../topology.js';
import { FitPiece } from './fit-piece.js';
import { FitStarThreshold } from './fit-star-threshold.js';
import { Placement } from './placement.js';

// Value object for the section of a Fit level (DS-6): the figure, the pieces,
// the witness and the star thresholds. It checks its own shape when it is
// created, so isSection() is gone. It holds the rules of the section too, A5
// included, so a FitSection that fails A5 never exists. FitLevelValidator
// only picks this type and gives it the Topology of the level (decision 6).
export class FitSection implements LevelSection {
  private constructor(
    private readonly figure: readonly Coordinate[],
    private readonly pieces: readonly FitPiece[],
    private readonly witness: readonly Placement[],
    private readonly stars: readonly FitStarThreshold[],
  ) {}

  // Reads { figure, pieces, witness, stars } from the section as it arrives.
  // Each field is a list of one item or more. A wrong field gives its own
  // level problem, so the border can name the field. Then the section checks
  // its rules on the topology of the level, A5 last.
  static of(raw: unknown, topology: Topology): Result<FitSection, LevelProblem> {
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
    const fitSection = new FitSection(figure, pieces, witness, stars);
    const problem = fitSection.problemOn(topology);
    return problem === undefined ? ok(fitSection) : err(problem);
  }

  // The first rule that the section breaks on the topology, or undefined. A
  // piece turns only on the cells of its topology, so each cell of each
  // field must be a cell of the topology before A5 runs.
  private problemOn(topology: Topology): LevelProblem | undefined {
    if (!this.figure.every((cell) => topology.holds(cell))) {
      return 'invalid-figure';
    }
    if (!this.pieces.every((piece) => piece.isOn(topology))) {
      return 'invalid-pieces';
    }
    if (!this.witness.every((entry) => entry.isOn(topology))) {
      return 'invalid-witness';
    }
    return this.a5ProblemOn(topology);
  }

  // A5: the witness, the solution of the designer, places each piece once.
  // The cells that it covers have the area of the figure, so the pieces do
  // too. Each covered cell lies in the figure, and no two covered cells are
  // the same cell, so the witness covers each cell of the figure once. Equal
  // areas alone are not enough. A cell that the figure lists twice counts
  // twice, so no witness covers that figure exactly. The check reads each
  // entry once and runs no search. It compares the cells with equals() and
  // keeps no Map, as decision 2 asks, so its cost grows with the square of
  // the cell count. A level has few cells.
  private a5ProblemOn(topology: Topology): LevelProblem | undefined {
    const placed = this.placedPieces();
    if (placed === undefined) {
      return 'inexact-witness';
    }
    const covered = placed.flatMap(([entry, piece]) => entry.coveredCells(piece, topology));
    if (covered.length !== this.figure.length) {
      return 'unequal-area';
    }
    const exact = covered.every(
      (cell, index) =>
        this.figure.some((figureCell) => figureCell.equals(cell)) &&
        !covered.slice(0, index).some((earlier) => earlier.equals(cell)),
    );
    return exact ? undefined : 'inexact-witness';
  }

  // Pairs each entry of the witness with the one piece that it places. It
  // gives undefined when an entry names no piece or two pieces, or when no
  // entry or two entries place one piece.
  private placedPieces(): readonly (readonly [Placement, FitPiece])[] | undefined {
    const eachPieceOnce = this.pieces.every(
      (piece) => this.witness.filter((entry) => entry.places(piece)).length === 1,
    );
    if (!eachPieceOnce) {
      return undefined;
    }
    const placed: (readonly [Placement, FitPiece])[] = [];
    for (const entry of this.witness) {
      const named = this.pieces.filter((piece) => entry.places(piece));
      if (named.length !== 1) {
        return undefined;
      }
      placed.push([entry, named[0]]);
    }
    return placed;
  }

  // Delivers the four fields to a receiver of the border, the mirror of of().
  // No operation returns them. Each part delivers its own value in turn.
  deliverTo(
    receiver: ValueReceiver<{
      readonly figure: readonly Coordinate[];
      readonly pieces: readonly FitPiece[];
      readonly witness: readonly Placement[];
      readonly stars: readonly FitStarThreshold[];
    }>,
  ): void {
    receiver.receive({
      figure: [...this.figure],
      pieces: [...this.pieces],
      witness: [...this.witness],
      stars: [...this.stars],
    });
  }

  // The most stars of a play of this level: the count of its star
  // thresholds (DS-6, #135).
  mostStars(): Stars {
    return mostStarsOf(this.stars);
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
