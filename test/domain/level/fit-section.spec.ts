import { FitPiece } from '../../../src/domain/level/fit/fit-piece.js';
import { FitSection } from '../../../src/domain/level/fit/fit-section.js';
import { FitStarThreshold } from '../../../src/domain/level/fit/fit-star-threshold.js';
import { Placement } from '../../../src/domain/level/fit/placement.js';
import { HexTopology } from '../../../src/domain/level/hex-topology.js';
import { Rotation } from '../../../src/domain/level/rotation.js';
import { levelExample, valueOf } from '../../support/level-format.js';

// The rules of the Fit section and of its parts enter through
// LevelValidators.check(), in level-validators-check.spec.ts (#255): the
// shape of each field, the rules of each part, A5, the topologies and the
// delivery. Only the equals() cases stay here. No code of src/ compares two
// sections, two pieces, two placements, two star thresholds or two
// rotations, so no case through the service or the root can reach them.
// The fixtures come from the Fit example of the format document.
function fitSection(): Record<string, unknown> {
  return levelExample('hexa-fit').section;
}

// Reads a raw section of a hex level, as the Fit example is.
function sectionOf(raw: unknown) {
  return FitSection.of(raw, new HexTopology());
}

describe('FitSection', () => {
  it('should_be_equal_when_two_sections_are_read_from_the_same_data', () => {
    expect(valueOf(sectionOf(fitSection())).equals(valueOf(sectionOf(fitSection())))).toBe(true);
  });

  // The section keeps every field it reads, in order: a change to one field
  // gives another section. Each list keeps its length. Each change keeps the
  // cover of A5, so each changed section is valid: the figure and the cells
  // of a come in another order, and c, a single cell, turns one step.
  it('should_differ_when_one_field_of_the_raw_section_differs', () => {
    const example = valueOf(sectionOf(fitSection()));
    const section = fitSection();
    const [figure, pieces, witness, stars] = [
      section.figure,
      section.pieces,
      section.witness,
      section.stars,
    ] as Record<string, unknown>[][];
    const cellsOfA = pieces[0].cells as number[][];
    const changed = [
      { ...section, figure: [figure[1], figure[0], ...figure.slice(2)] },
      {
        ...section,
        pieces: [
          { ...pieces[0], cells: [cellsOfA[1], cellsOfA[0], cellsOfA[2]] },
          ...pieces.slice(1),
        ],
      },
      { ...section, witness: [...witness.slice(0, 2), { ...witness[2], rotation: 1 }] },
      { ...section, stars: [{ ...stars[0], maxElapsedMs: 119999 }, ...stars.slice(1)] },
    ];

    expect(changed.map((raw) => example.equals(valueOf(sectionOf(raw))))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('Rotation', () => {
  it('should_be_equal_when_two_rotations_hold_the_same_count', () => {
    const one = valueOf(Rotation.of(1));

    expect(one.equals(valueOf(Rotation.of(1)))).toBe(true);
    expect(one.equals(valueOf(Rotation.of(2)))).toBe(false);
  });
});

describe('FitPiece', () => {
  const piece = {
    id: 'a',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
  };

  it('should_be_equal_when_two_pieces_hold_the_same_id_and_the_same_cells_in_order', () => {
    const a = valueOf(FitPiece.of(piece));

    expect([
      a.equals(
        valueOf(
          FitPiece.of({
            id: 'a',
            cells: [
              [0, 0],
              [1, 0],
              [0, 1],
            ],
          }),
        ),
      ),
      a.equals(valueOf(FitPiece.of({ id: 'b', cells: piece.cells }))),
      a.equals(
        valueOf(
          FitPiece.of({
            id: 'a',
            cells: [
              [0, 0],
              [1, 0],
            ],
          }),
        ),
      ),
      a.equals(
        valueOf(
          FitPiece.of({
            id: 'a',
            cells: [
              [0, 1],
              [1, 0],
              [0, 0],
            ],
          }),
        ),
      ),
    ]).toEqual([true, false, false, false]);
  });
});

describe('Placement', () => {
  const placement = { piece: 'b', rotation: 1, at: [2, 0] };

  it('should_be_equal_when_two_placements_hold_the_same_piece_rotation_and_offset', () => {
    const b = valueOf(Placement.of(placement));

    expect([
      b.equals(valueOf(Placement.of({ piece: 'b', rotation: 1, at: [2, 0] }))),
      b.equals(valueOf(Placement.of({ ...placement, piece: 'c' }))),
      b.equals(valueOf(Placement.of({ ...placement, rotation: 0 }))),
      b.equals(valueOf(Placement.of({ ...placement, at: [2, 1] }))),
    ]).toEqual([true, false, false, false]);
  });
});

describe('FitStarThreshold', () => {
  const threshold = { maxMoves: 8, maxElapsedMs: 60000 };

  it('should_be_equal_when_two_thresholds_hold_the_same_limits', () => {
    const eight = valueOf(FitStarThreshold.of(threshold));

    expect([
      eight.equals(valueOf(FitStarThreshold.of({ maxMoves: 8, maxElapsedMs: 60000 }))),
      eight.equals(valueOf(FitStarThreshold.of({ ...threshold, maxMoves: 9 }))),
      eight.equals(valueOf(FitStarThreshold.of({ ...threshold, maxElapsedMs: 60001 }))),
    ]).toEqual([true, false, false]);
  });
});
