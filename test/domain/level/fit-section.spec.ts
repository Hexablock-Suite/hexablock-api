import { FitPiece } from '../../../src/domain/level/fit/fit-piece.js';
import { FitSection } from '../../../src/domain/level/fit/fit-section.js';
import { FitStarThreshold } from '../../../src/domain/level/fit/fit-star-threshold.js';
import { PieceId } from '../../../src/domain/level/fit/piece-id.js';
import { Placement } from '../../../src/domain/level/fit/placement.js';
import { Rotation } from '../../../src/domain/level/fit/rotation.js';
import { HexTopology } from '../../../src/domain/level/hex-topology.js';
import { deliveredBy } from '../../support/recording-receiver.js';
import { levelExample, valueOf } from '../../support/level-format.js';

// The Fit section of DS-6. Each class checks its own shape when it is created
// and returns a Result. The fixtures come from the Fit example of the format
// document, so the document and the code cannot drift.
function fitSection(): Record<string, unknown> {
  return levelExample('hexa-fit').section;
}

// Reads a raw section of a hex level, as the Fit example is.
function sectionOf(raw: unknown) {
  return FitSection.of(raw, new HexTopology());
}

describe('FitSection', () => {
  it('should_build_the_section_when_the_fit_example_is_read', () => {
    expect(sectionOf(fitSection()).ok).toBe(true);
  });

  it('should_return_invalid_section_when_the_raw_value_is_not_an_object_with_exactly_the_four_fields', () => {
    const bad: unknown[] = [null, [], 'section', { ...fitSection(), extra: true }];

    expect(bad.map((raw) => sectionOf(raw))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-section' })),
    );
  });

  // Each field gives its own problem, so the border can name the field.
  it('should_return_the_problem_of_the_field_when_a_field_is_missing_or_an_empty_list', () => {
    const { figure, pieces, witness, stars } = fitSection();

    expect([
      sectionOf({ pieces, witness, stars }),
      sectionOf({ figure, witness, stars }),
      sectionOf({ figure, pieces, stars }),
      sectionOf({ figure, pieces, witness }),
      sectionOf({ figure: [], pieces, witness, stars }),
      sectionOf({ figure, pieces: [], witness, stars }),
      sectionOf({ figure, pieces, witness: [], stars }),
      sectionOf({ figure, pieces, witness, stars: [] }),
    ]).toEqual([
      { ok: false, error: 'invalid-figure' },
      { ok: false, error: 'invalid-pieces' },
      { ok: false, error: 'invalid-witness' },
      { ok: false, error: 'invalid-stars' },
      { ok: false, error: 'invalid-figure' },
      { ok: false, error: 'invalid-pieces' },
      { ok: false, error: 'invalid-witness' },
      { ok: false, error: 'invalid-stars' },
    ]);
  });

  it('should_return_the_problem_of_the_field_when_one_item_of_a_list_is_wrong', () => {
    const section = fitSection();

    expect([
      sectionOf({
        ...section,
        figure: [
          [0, 0],
          [0.5, 1],
        ],
      }),
      sectionOf({ ...section, pieces: [{ id: 'a', cells: [] }] }),
      sectionOf({ ...section, witness: [{ piece: 'a', rotation: 0.5, at: [0, 0] }] }),
      sectionOf({ ...section, stars: [{ maxMoves: 4 }] }),
    ]).toEqual([
      { ok: false, error: 'invalid-figure' },
      { ok: false, error: 'invalid-pieces' },
      { ok: false, error: 'invalid-witness' },
      { ok: false, error: 'invalid-stars' },
    ]);
  });

  // Moves.of and ElapsedTime.ofMs throw until #103. The section turns that
  // throw into a level problem, so a bad level file never gives a 500.
  it('should_return_invalid_stars_when_a_star_threshold_is_negative', () => {
    const section = fitSection();

    expect(sectionOf({ ...section, stars: [{ maxMoves: -1, maxElapsedMs: 1000 }] })).toEqual({
      ok: false,
      error: 'invalid-stars',
    });
    expect(sectionOf({ ...section, stars: [{ maxMoves: 4, maxElapsedMs: -1 }] })).toEqual({
      ok: false,
      error: 'invalid-stars',
    });
  });

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

describe('PieceId', () => {
  it('should_deliver_the_id_as_it_arrives_when_it_is_a_non_blank_text', () => {
    expect(deliveredBy(valueOf(PieceId.of('a')))).toEqual(['a']);
    expect(deliveredBy(valueOf(PieceId.of(' long piece ')))).toEqual([' long piece ']);
  });

  it('should_return_invalid_piece_id_when_the_id_is_blank_or_not_a_text', () => {
    const bad: unknown[] = ['', '   ', 7, null];

    expect(bad.map((raw) => PieceId.of(raw))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-piece-id' })),
    );
  });

  it('should_be_equal_when_two_ids_hold_the_same_text', () => {
    const a = valueOf(PieceId.of('a'));

    expect(a.equals(valueOf(PieceId.of('a')))).toBe(true);
    expect(a.equals(valueOf(PieceId.of('A')))).toBe(false);
  });
});

describe('Rotation', () => {
  // The count of steps of the topology. A negative count turns the other way.
  it('should_deliver_the_count_when_it_is_a_safe_integer', () => {
    expect([0, 5, -1].map((steps) => deliveredBy(valueOf(Rotation.of(steps))))).toEqual([
      [0],
      [5],
      [-1],
    ]);
    expect(Object.is(deliveredBy(valueOf(Rotation.of(-0)))[0], 0)).toBe(true);
  });

  it('should_return_invalid_rotation_when_the_count_is_not_a_safe_integer', () => {
    const bad: unknown[] = [0.5, '1', Number.NaN, 2 ** 53, null];

    expect(bad.map((raw) => Rotation.of(raw))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-rotation' })),
    );
  });

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

  it('should_return_the_problem_of_the_part_when_the_raw_piece_is_wrong', () => {
    expect([
      FitPiece.of(piece).ok,
      FitPiece.of({ ...piece, extra: 1 }),
      FitPiece.of({ cells: piece.cells }),
      FitPiece.of({ id: 'a', cells: [] }),
      FitPiece.of({ id: 'a', cells: [[0, 'x']] }),
    ]).toEqual([
      true,
      { ok: false, error: 'invalid-piece' },
      { ok: false, error: 'invalid-piece-id' },
      { ok: false, error: 'invalid-piece' },
      { ok: false, error: 'invalid-piece' },
    ]);
  });

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

  it('should_return_the_problem_of_the_part_when_the_raw_placement_is_wrong', () => {
    expect([
      Placement.of(placement).ok,
      Placement.of('b@2,0'),
      Placement.of({ ...placement, mirrored: false }),
      Placement.of({ ...placement, piece: '' }),
      Placement.of({ ...placement, rotation: '1' }),
      Placement.of({ ...placement, at: [] }),
    ]).toEqual([
      true,
      { ok: false, error: 'invalid-placement' },
      { ok: false, error: 'invalid-placement' },
      { ok: false, error: 'invalid-piece-id' },
      { ok: false, error: 'invalid-rotation' },
      { ok: false, error: 'invalid-coordinate' },
    ]);
  });

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

  it('should_return_invalid_star_threshold_when_the_raw_threshold_is_wrong', () => {
    const bad: unknown[] = [
      { maxMoves: 8 },
      { ...threshold, extra: 1 },
      { ...threshold, maxMoves: -1 },
      { ...threshold, maxMoves: 1.5 },
      { ...threshold, maxElapsedMs: -1 },
      { ...threshold, maxElapsedMs: '60000' },
    ];

    expect(FitStarThreshold.of(threshold).ok).toBe(true);
    expect(bad.map((raw) => FitStarThreshold.of(raw))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-star-threshold' })),
    );
  });

  it('should_be_equal_when_two_thresholds_hold_the_same_limits', () => {
    const eight = valueOf(FitStarThreshold.of(threshold));

    expect([
      eight.equals(valueOf(FitStarThreshold.of({ maxMoves: 8, maxElapsedMs: 60000 }))),
      eight.equals(valueOf(FitStarThreshold.of({ ...threshold, maxMoves: 9 }))),
      eight.equals(valueOf(FitStarThreshold.of({ ...threshold, maxElapsedMs: 60001 }))),
    ]).toEqual([true, false, false]);
  });
});
