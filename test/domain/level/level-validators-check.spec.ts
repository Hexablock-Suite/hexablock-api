import { receiveJsonOf } from '../../../src/adapters/received.js';
import type { IncomingLevel } from '../../../src/application/levels/update-levels.use-case.js';
import { levelExample, levelValidators, valueOf } from '../../support/level-format.js';
import { LevelMother, type OneCellPlacement } from '../../support/object-mother/level-mother.js';

// The rules of a level enter through the domain service (#255): check()
// picks the strategy of the game, and the strategy reads the section as it
// arrives. FitLevelValidator and SortLevelValidator hold no rule, so these
// cases never call a strategy, a section, a part of a section or a topology
// alone. The registry holds the strategies and the topologies that the
// composition root registers: Fit on hex, square and triangle, and Sort.
// Each case gives the incoming levels of the Object Mother and reads the
// answer of the service, or the level that it builds.
const validators = levelValidators();

// The when step of each case: the service checks one incoming level.
const check = ({ gameId, levelId, order, version, topology, section }: IncomingLevel) =>
  validators.check(gameId, levelId, order, version, topology, section);

// The answer of the service for each level: ok, or the code of the problem.
const answersOf = (levels: readonly IncomingLevel[]) =>
  levels.map((level) => {
    const checked = check(level);
    return checked.ok ? 'ok' : checked.error;
  });

// The level that the service builds, as the border receives it.
const deliveredJsonOf = (level: IncomingLevel) => receiveJsonOf(valueOf(check(level)));

const fitWith = (changes: Record<string, unknown>) =>
  LevelMother.fitLevel({ ...LevelMother.fitParts().section, ...changes });

const sortWith = (changes: Record<string, unknown>) =>
  LevelMother.sortLevel({ ...LevelMother.sortSection(), ...changes });

describe('LevelValidators.check() and the Fit section', () => {
  it('should_return_invalid_section_when_the_raw_fit_section_is_not_an_object_with_exactly_the_four_fields', () => {
    const { section } = LevelMother.fitParts();
    const raws: unknown[] = [
      null,
      [],
      'section',
      { ...section, extra: true },
      LevelMother.sortSection(),
    ];

    expect(answersOf(raws.map((raw) => LevelMother.fitLevel(raw)))).toEqual(
      raws.map(() => 'invalid-section'),
    );
  });

  // Each field gives its own problem, so the border can name the field.
  it('should_return_the_problem_of_the_field_when_a_fit_field_is_missing_or_an_empty_list', () => {
    const { figure, pieces, witness, stars } = LevelMother.fitParts().section;

    expect(
      answersOf([
        LevelMother.fitLevel({ pieces, witness, stars }),
        LevelMother.fitLevel({ figure, witness, stars }),
        LevelMother.fitLevel({ figure, pieces, stars }),
        LevelMother.fitLevel({ figure, pieces, witness }),
        fitWith({ figure: [] }),
        fitWith({ pieces: [] }),
        fitWith({ witness: [] }),
        fitWith({ stars: [] }),
      ]),
    ).toEqual([
      'invalid-figure',
      'invalid-pieces',
      'invalid-witness',
      'invalid-stars',
      'invalid-figure',
      'invalid-pieces',
      'invalid-witness',
      'invalid-stars',
    ]);
  });

  // A cell is a list of one safe integer or more. The figure gives the code
  // of its field, not the code of the cell (decision 11, #223).
  it('should_return_invalid_figure_when_a_cell_is_not_a_list_of_safe_integers', () => {
    const { figure } = LevelMother.fitParts();
    const cells: unknown[] = [
      [],
      [1.5, 0],
      ['0', 0],
      [Number.NaN, 0],
      [2 ** 53, 0],
      '0,0',
      null,
      {},
    ];

    expect(
      answersOf(cells.map((cell) => fitWith({ figure: [...figure.slice(0, -1), cell] }))),
    ).toEqual(cells.map(() => 'invalid-figure'));
  });

  // A piece is { id, cells }: a non-blank text and a list of one cell or more.
  it('should_return_invalid_pieces_when_a_piece_is_not_a_non_blank_id_and_a_list_of_cells', () => {
    const { pieceA, pieceB, pieceC, placeA, placeB } = LevelMother.fitParts();
    const wrongC: unknown[] = [
      { ...pieceC, extra: 1 },
      { cells: pieceC.cells },
      { ...pieceC, cells: [] },
      { ...pieceC, cells: [[0, 'x']] },
      { ...pieceC, id: '' },
      { ...pieceC, id: '   ' },
      { ...pieceC, id: 7 },
      { ...pieceC, id: null },
      'c',
    ];

    expect(
      answersOf(
        wrongC.map((piece) =>
          fitWith({ pieces: [pieceA, pieceB, piece], witness: [placeA, placeB] }),
        ),
      ),
    ).toEqual(wrongC.map(() => 'invalid-pieces'));
  });

  // An entry is { piece, rotation, at }: a piece id, a safe integer of steps
  // and a cell.
  it('should_return_invalid_witness_when_an_entry_is_not_a_piece_id_a_rotation_and_an_offset', () => {
    const { placeA, placeB, placeC } = LevelMother.fitParts();
    const wrongC: unknown[] = [
      'c@1,1',
      { ...placeC, mirrored: false },
      { ...placeC, piece: '' },
      { ...placeC, piece: '   ' },
      { ...placeC, piece: 7 },
      { ...placeC, at: [] },
      { ...placeC, rotation: 0.5 },
      { ...placeC, rotation: '1' },
      { ...placeC, rotation: Number.NaN },
      { ...placeC, rotation: 2 ** 53 },
      { ...placeC, rotation: null },
    ];

    expect(answersOf(wrongC.map((entry) => fitWith({ witness: [placeA, placeB, entry] })))).toEqual(
      wrongC.map(() => 'invalid-witness'),
    );
  });

  // A Fit star is { maxMoves, maxElapsedMs }, two non-negative safe
  // integers. Moves.of() and ElapsedTime.ofMs() return a failed Result for a
  // negative limit (#103), so a bad level file never gives a server error.
  it('should_return_invalid_stars_without_a_throw_when_a_fit_star_threshold_is_wrong', () => {
    const threshold = { maxMoves: 8, maxElapsedMs: 60000 };
    const wrong: unknown[] = [
      { maxMoves: 8 },
      { ...threshold, extra: 1 },
      { ...threshold, maxMoves: -1 },
      { ...threshold, maxMoves: 1.5 },
      { ...threshold, maxMoves: '8' },
      { ...threshold, maxElapsedMs: -1 },
      { ...threshold, maxElapsedMs: '60000' },
    ];
    const answers = () => answersOf(wrong.map((star) => fitWith({ stars: [threshold, star] })));

    expect(answers).not.toThrow();
    expect(answers()).toEqual(wrong.map(() => 'invalid-stars'));
  });

  // Decision 6: the strategy finds the Topology of the level with
  // TopologyId.equals(). A topology with no entry has no rotation steps, so
  // A5 cannot run.
  it('should_return_unknown_topology_when_the_composition_root_knows_no_topology_of_the_fit_level', () => {
    expect(
      answersOf([
        LevelMother.fitLevel(undefined, 'cube'),
        LevelMother.fitLevel(undefined, 'hex-2'),
      ]),
    ).toEqual(['unknown-topology', 'unknown-topology']);
  });

  // A cell of hex, square and triangle has two values. A coordinate with
  // another length is a valid Coordinate but not a cell, so its field is wrong.
  it('should_return_the_problem_of_the_field_when_a_cell_is_not_a_cell_of_the_topology', () => {
    const cell = { cell: [0, 0], rotation: 0, at: [0, 0], figure: [0, 0] };
    const wrong: OneCellPlacement[] = [
      { ...cell, figure: [0, 0, 0] },
      { ...cell, figure: [0] },
      { ...cell, cell: [0, 0, 0] },
      { ...cell, cell: [0] },
      { ...cell, at: [0, 0, 0] },
      { ...cell, at: [0] },
    ];
    const expected = [
      'invalid-figure',
      'invalid-figure',
      'invalid-pieces',
      'invalid-pieces',
      'invalid-witness',
      'invalid-witness',
    ];

    expect(
      ['hex', 'square', 'triangle'].map((topology) =>
        answersOf(wrong.map((placement) => LevelMother.oneCellLevel(topology, placement))),
      ),
    ).toEqual([expected, expected, expected]);
  });

  // The trap of A5: equal areas are necessary but not enough. Each level here
  // has pieces of 6 cells and a figure of 6 cells.
  it('should_return_inexact_witness_when_the_areas_are_equal_and_the_witness_does_not_cover_the_figure_exactly', () => {
    const { placeA, placeB, placeC } = LevelMother.fitParts();
    const witnesses = [
      // b keeps its cells [2, 0] and [3, 0]: [3, 0] lies outside, and [2, 1] stays open.
      [placeA, { ...placeB, rotation: 0 }, placeC],
      // c lies on [0, 0], a cell of a, and [1, 1] stays open.
      [placeA, placeB, { ...placeC, at: [0, 0] }],
      // b turns two steps to [2, 0] and [1, 1], a cell of c.
      [placeA, { ...placeB, rotation: 2 }, placeC],
      // b turns one step the other way to [2, 0] and [3, -1], outside the figure.
      [placeA, { ...placeB, rotation: -1 }, placeC],
    ];

    expect(answersOf(witnesses.map((witness) => fitWith({ witness })))).toEqual(
      witnesses.map(() => 'inexact-witness'),
    );
  });

  // The witness is the solution of the designer: it places each piece once.
  // An entry names a piece by its id, as written.
  it('should_return_inexact_witness_when_the_witness_does_not_place_each_piece_once', () => {
    const { pieceA, pieceB, pieceC, placeA, placeB, placeC } = LevelMother.fitParts();

    expect(
      answersOf([
        // An entry names a piece that the level does not have.
        fitWith({ witness: [placeA, placeB, { ...placeC, piece: 'z' }] }),
        // An entry names C, and the level has c.
        fitWith({ witness: [placeA, placeB, { ...placeC, piece: 'C' }] }),
        // c is placed twice.
        fitWith({ witness: [placeA, placeB, placeC, { ...placeC, at: [3, 0] }] }),
        // c is never placed.
        fitWith({ witness: [placeA, placeB] }),
        // Two pieces have the id a, so the entry a names two pieces.
        fitWith({
          pieces: [pieceA, pieceB, { ...pieceC, id: 'a' }],
          witness: [placeA, placeB, { ...placeC, piece: 'a' }],
        }),
      ]),
    ).toEqual([
      'inexact-witness',
      'inexact-witness',
      'inexact-witness',
      'inexact-witness',
      'inexact-witness',
    ]);
  });

  // A5: the areas of the pieces add up to the area of the figure. A cell that
  // the figure lists twice counts twice.
  it('should_return_unequal_area_when_the_pieces_do_not_have_the_area_of_the_figure', () => {
    const { figure, pieceA, pieceB, pieceC } = LevelMother.fitParts();

    expect(
      answersOf([
        fitWith({ figure: [...figure, [3, 0]] }),
        fitWith({ figure: [...figure, [0, 0]] }),
        fitWith({
          pieces: [
            pieceA,
            pieceB,
            {
              ...pieceC,
              cells: [
                [0, 0],
                [1, 0],
              ],
            },
          ],
        }),
      ]),
    ).toEqual(['unequal-area', 'unequal-area', 'unequal-area']);
  });

  // A rotation counts steps of the topology: six steps make a full turn on
  // hex, and a negative count turns the other way. So 7, -5 and the largest
  // safe integer turn b as one step does, and no rotation runs a long loop.
  it('should_build_the_level_when_the_rotation_of_a_piece_differs_from_the_example_by_whole_turns', () => {
    const { placeA, placeB, placeC } = LevelMother.fitParts();
    const turns = [7, -5, Number.MAX_SAFE_INTEGER];

    expect(
      answersOf(
        turns.map((rotation) => fitWith({ witness: [placeA, { ...placeB, rotation }, placeC] })),
      ),
    ).toEqual(['ok', 'ok', 'ok']);
  });
});

describe('LevelValidators.check() and the Sort section', () => {
  it('should_return_invalid_section_when_the_raw_sort_section_is_not_an_object_with_exactly_the_four_fields', () => {
    const section = LevelMother.sortSection();
    const raws: unknown[] = [
      null,
      [],
      'section',
      { ...section, extra: true },
      LevelMother.fitParts().section,
    ];

    expect(answersOf(raws.map((raw) => LevelMother.sortLevel(raw)))).toEqual(
      raws.map(() => 'invalid-section'),
    );
  });

  // Each field gives its own problem, so the border can name the field.
  it('should_return_the_problem_of_the_field_when_a_sort_field_is_missing', () => {
    const { radius, goals, source, stars } = LevelMother.sortSection();

    expect(
      answersOf([
        LevelMother.sortLevel({ goals, source, stars }),
        LevelMother.sortLevel({ radius, source, stars }),
        LevelMother.sortLevel({ radius, goals, stars }),
        LevelMother.sortLevel({ radius, goals, source }),
      ]),
    ).toEqual(['invalid-radius', 'invalid-goals', 'invalid-source', 'invalid-stars']);
  });

  it('should_return_invalid_radius_when_the_radius_is_below_1_or_not_a_safe_integer', () => {
    const radii: unknown[] = [0, -1, 1.5, '2', Number.NaN, 2 ** 53];

    expect(answersOf(radii.map((radius) => sortWith({ radius })))).toEqual(
      radii.map(() => 'invalid-radius'),
    );
  });

  // A goal of 0 wins before the first move (app D21), so the goal is 1 or more.
  it('should_return_invalid_goals_when_the_goal_is_below_1_or_not_a_safe_integer', () => {
    const goals: unknown[] = [0, -1, 1.5, '3', Number.NaN, 2 ** 53];

    expect(answersOf(goals.map((goal) => sortWith({ goals: goal })))).toEqual(
      goals.map(() => 'invalid-goals'),
    );
  });

  // A level picks one of the two kinds of source (app A4). A broken seed,
  // color or stack gives the code of the field (decision 11, #223).
  it('should_return_invalid_source_when_the_raw_source_is_neither_a_seeded_nor_a_fixed_source', () => {
    const seeded = { seed: 7, colors: ['red', 'green'] };
    const fixed = { stacks: [['red', 'red', 'blue'], ['green'], ['blue', 'green']] };
    const sources: unknown[] = [
      null,
      { ...seeded, ...fixed },
      { seed: 7 },
      { ...seeded, colors: [] },
      { ...seeded, colors: ['red', ''] },
      { ...seeded, colors: ['red', '  '] },
      { ...seeded, colors: ['red', 3] },
      { ...seeded, colors: ['red', null] },
      { ...seeded, seed: -1 },
      { ...seeded, seed: 4294967296 },
      { ...seeded, seed: 1.5 },
      { ...seeded, seed: '7' },
      { ...seeded, seed: Number.NaN },
      { stacks: [] },
      { stacks: [['red'], []] },
      { stacks: [['red', 4]] },
    ];

    expect(answersOf(sources.map((source) => sortWith({ source })))).toEqual(
      sources.map(() => 'invalid-source'),
    );
  });

  // The seeds of the app are the unsigned 32-bit integers.
  it('should_build_the_level_when_the_source_is_seeded_from_0_to_4294967295_or_a_fixed_list_of_stacks', () => {
    expect(
      answersOf([
        sortWith({ source: { seed: 0, colors: ['red'] } }),
        sortWith({ source: { seed: 4294967295, colors: ['red'] } }),
        sortWith({ source: { stacks: [['red', 'red', 'blue'], ['green'], ['blue', 'green']] } }),
      ]),
    ).toEqual(['ok', 'ok', 'ok']);
  });

  // A Sort star is { maxMoves }, a non-negative safe integer. Moves.of()
  // returns a failed Result for a negative limit (#103), so a bad level file
  // never gives a server error.
  it('should_return_invalid_stars_without_a_throw_when_a_sort_star_threshold_is_wrong', () => {
    const lists: unknown[] = [
      [],
      [{ maxMoves: 30, extra: 1 }],
      [{ maxMoves: 30, maxElapsedMs: 1000 }],
      [{ maxMoves: -1 }],
      [{ maxMoves: 40 }, { maxMoves: -5 }],
      [{ maxMoves: 1.5 }],
      [{ maxMoves: '30' }],
    ];
    const answers = () => answersOf(lists.map((stars) => sortWith({ stars })));

    expect(answers).not.toThrow();
    expect(answers()).toEqual(lists.map(() => 'invalid-stars'));
  });

  // No rule of the Sort section needs the topology (decision 6). The API
  // never rejects a level only because its topology is not hex.
  it('should_build_the_same_section_when_the_topology_of_the_sort_level_is_not_hex', () => {
    const section = LevelMother.sortSection();

    expect(
      ['square', 'cube'].map((topology) => {
        const json = deliveredJsonOf(LevelMother.sortLevel(section, topology));
        return json !== null && typeof json === 'object' && 'section' in json && json.section;
      }),
    ).toEqual([section, section]);
  });
});

// A5 turns each piece around its origin by the steps of the topology of the
// level, and then it moves the piece by its offset (docs/level-format.md).
// Each level here has one piece of one cell and a figure of one cell, so the
// service builds it only when the topology takes the cell of the piece to
// the cell of the figure.
const oneCellAnswers = (topology: string, placements: readonly OneCellPlacement[]) =>
  answersOf(placements.map((placement) => LevelMother.oneCellLevel(topology, placement)));

// The placements that turn a cell by a count of steps and move it by no offset.
const turns = (rows: readonly [number[], number, number[]][]): OneCellPlacement[] =>
  rows.map(([cell, rotation, figure]) => ({ cell, rotation, at: [0, 0], figure }));

// The placements that move a cell by an offset and turn it by no step.
const moves = (rows: readonly [number[], number[], number[]][]): OneCellPlacement[] =>
  rows.map(([cell, at, figure]) => ({ cell, rotation: 0, at, figure }));

describe('LevelValidators.check() and the topologies of the Fit section', () => {
  // One hex step is a sixth of a turn: [q, r] turns to [-r, q + r].
  it('should_turn_q_r_to_minus_r_q_plus_r_when_a_hex_piece_turns_one_step', () => {
    const placements = turns([
      [[1, 0], 1, [0, 1]],
      [[0, 1], 1, [-1, 1]],
      [[2, -1], 1, [1, 1]],
      [[0, 0], 1, [0, 0]],
    ]);

    expect(oneCellAnswers('hex', placements)).toEqual(placements.map(() => 'ok'));
  });

  // Six steps make a full turn, and a negative count turns the other way. A
  // count turns only the steps left after its whole turns, so the largest
  // safe integer runs no long loop.
  it('should_turn_the_steps_left_after_whole_turns_when_a_hex_count_is_negative_or_a_full_turn_or_more', () => {
    const placements = turns([
      [[1, 0], 0, [1, 0]],
      [[1, 0], 2, [-1, 1]],
      [[1, 0], 6, [1, 0]],
      [[1, 0], 7, [0, 1]],
      [[1, 0], -1, [1, -1]],
      [[1, 0], -6, [1, 0]],
      [[1, 0], Number.MAX_SAFE_INTEGER, [0, 1]],
    ]);

    expect(oneCellAnswers('hex', placements)).toEqual(placements.map(() => 'ok'));
  });

  // One square step is a quarter turn: [col, row] turns to [-row, col], as
  // SquareCoord.turned() of the app does. Four steps make a full turn.
  it('should_turn_col_row_to_minus_row_col_when_a_square_piece_turns_one_step', () => {
    const placements = turns([
      [[1, 0], 1, [0, 1]],
      [[0, 1], 1, [-1, 0]],
      [[2, 3], 1, [-3, 2]],
      [[0, 0], 1, [0, 0]],
    ]);

    expect(oneCellAnswers('square', placements)).toEqual(placements.map(() => 'ok'));
  });

  it('should_turn_the_steps_left_after_whole_turns_when_a_square_count_is_negative_or_a_full_turn_or_more', () => {
    const placements = turns([
      [[1, 0], 0, [1, 0]],
      [[1, 0], 2, [-1, 0]],
      [[1, 0], 4, [1, 0]],
      [[1, 0], 5, [0, 1]],
      [[1, 0], -1, [0, -1]],
      [[1, 0], Number.MAX_SAFE_INTEGER, [0, -1]],
    ]);

    expect(oneCellAnswers('square', placements)).toEqual(placements.map(() => 'ok'));
  });

  // One triangle step is a sixth of a turn around the vertex at the origin,
  // as TriangleCoord.turned() of the app does. The six triangles around that
  // vertex follow each other, and each step flips the orientation: a cell
  // with an even col + row points up, and an odd one points down.
  it('should_take_each_triangle_to_the_next_one_around_the_origin_vertex_when_a_triangle_piece_turns_one_step', () => {
    const placements = turns([
      [[0, 0], 1, [1, 0]],
      [[1, 0], 1, [2, 0]],
      [[2, 0], 1, [2, 1]],
      [[2, 1], 1, [1, 1]],
      [[1, 1], 1, [0, 1]],
      [[0, 1], 1, [0, 0]],
      [[-1, 1], 1, [-1, 0]],
      [[3, 2], 1, [0, 2]],
      [[-2, -3], 1, [5, -3]],
    ]);

    expect(oneCellAnswers('triangle', placements)).toEqual(placements.map(() => 'ok'));
  });

  it('should_turn_the_steps_left_after_whole_turns_when_a_triangle_count_is_negative_or_a_full_turn_or_more', () => {
    const placements = turns([
      [[0, 0], 0, [0, 0]],
      [[0, 0], 2, [2, 0]],
      [[0, 0], 6, [0, 0]],
      [[0, 0], 7, [1, 0]],
      [[0, 0], -1, [0, 1]],
      [[0, 0], Number.MAX_SAFE_INTEGER, [1, 0]],
    ]);

    expect(oneCellAnswers('triangle', placements)).toEqual(placements.map(() => 'ok'));
  });

  // An offset of hex and square adds one value at a time, as the Fit example
  // of docs/level-format.md places piece b at [2, 0].
  it('should_add_the_offset_to_each_value_when_a_hex_or_a_square_piece_moves', () => {
    const placements = moves([
      [
        [0, 1],
        [2, 0],
        [2, 1],
      ],
      [
        [1, -2],
        [-3, 4],
        [-2, 2],
      ],
    ]);

    expect([oneCellAnswers('hex', placements), oneCellAnswers('square', placements)]).toEqual([
      ['ok', 'ok'],
      ['ok', 'ok'],
    ]);
  });

  // An offset of triangle counts lattice cells: one step of col is two
  // triangles to the right, and one step of row is one row down and one
  // triangle to the right. So a move never flips a triangle, as
  // TriangleCoord.translated() of the app does. A plain sum of the values
  // would take [0, 0] by [1, 0] to the down triangle [1, 0].
  it('should_keep_the_orientation_when_a_triangle_piece_moves_by_a_lattice_offset', () => {
    const placements = moves([
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      [
        [0, 0],
        [0, 1],
        [1, 1],
      ],
      [
        [1, 0],
        [-1, 1],
        [0, 1],
      ],
      [
        [0, 1],
        [-1, 1],
        [-1, 2],
      ],
    ]);

    expect(oneCellAnswers('triangle', placements)).toEqual(placements.map(() => 'ok'));
  });
});

// The border reads a level that the service builds only through the delivery
// of the root, in the fields of the shared level format. Each part delivers
// its own value, and the section delivers its parts in order.
describe('LevelValidators.check() and the level that it builds', () => {
  it('should_deliver_the_level_of_the_format_document_when_the_service_builds_an_example', () => {
    const fixed = { stacks: [['red', 'red', 'blue'], ['green'], ['blue', 'green']] };

    expect([
      deliveredJsonOf(LevelMother.fitLevel()),
      deliveredJsonOf(LevelMother.sortLevel()),
      deliveredJsonOf(sortWith({ source: fixed })),
    ]).toEqual([
      levelExample('hexa-fit'),
      levelExample('hexa-sort'),
      { ...levelExample('hexa-sort'), section: { ...LevelMother.sortSection(), source: fixed } },
    ]);
  });

  // A piece id and a color compare as written, as the app compares them.
  it('should_deliver_each_text_as_it_arrives_when_a_piece_id_or_a_color_has_spaces_or_capitals', () => {
    const { section, pieceA, pieceB, pieceC, placeA, placeB, placeC } = LevelMother.fitParts();
    const fit = {
      ...section,
      pieces: [{ ...pieceA, id: ' long piece ' }, pieceB, pieceC],
      witness: [{ ...placeA, piece: ' long piece ' }, placeB, placeC],
    };
    const sort = { ...LevelMother.sortSection(), source: { seed: 7, colors: ['Red', 'red'] } };

    expect([
      deliveredJsonOf(LevelMother.fitLevel(fit)),
      deliveredJsonOf(LevelMother.sortLevel(sort)),
    ]).toEqual([
      { ...levelExample('hexa-fit'), section: fit },
      { ...levelExample('hexa-sort'), section: sort },
    ]);
  });

  // A negative zero is stored as 0, so two equal values deliver the same number.
  it('should_deliver_zero_when_a_cell_a_rotation_or_a_seed_is_a_negative_zero', () => {
    const { section, figure, placeA, placeB, placeC } = LevelMother.fitParts();
    const fit = deliveredJsonOf(
      LevelMother.fitLevel({
        ...section,
        figure: [[-0, 0], ...figure.slice(1)],
        witness: [{ ...placeA, rotation: -0 }, placeB, placeC],
      }),
    ) as { section: { figure: number[][]; witness: { rotation: number }[] } };
    const sort = deliveredJsonOf(sortWith({ source: { seed: -0, colors: ['red'] } })) as {
      section: { source: { seed: number } };
    };

    expect([
      Object.is(fit.section.figure[0][0], 0),
      Object.is(fit.section.witness[0].rotation, 0),
      Object.is(sort.section.source.seed, 0),
    ]).toEqual([true, true, true]);
  });

  // The level keeps its own copy of each cell, so a change to the raw
  // section or to a delivered list does not change it.
  it('should_keep_its_cells_when_the_raw_section_or_a_delivered_section_changes', () => {
    const { section, figure } = LevelMother.fitParts();
    const level = valueOf(check(LevelMother.fitLevel(section)));
    figure[0][0] = 9;
    const delivered = receiveJsonOf(level) as { section: { figure: number[][] } };
    delivered.section.figure[0][1] = 9;

    expect(receiveJsonOf(level)).toEqual(levelExample('hexa-fit'));
  });
});
