import { FitLevelValidator } from '../../../src/domain/level/fit/fit-level-validator.js';
import { FitSection } from '../../../src/domain/level/fit/fit-section.js';
import { HexTopology } from '../../../src/domain/level/hex-topology.js';
import { LevelOrder } from '../../../src/domain/level/level-order.js';
import { LevelValidators } from '../../../src/domain/level/level-validators.js';
import { LevelVersion } from '../../../src/domain/level/level-version.js';
import { Topologies } from '../../../src/domain/level/topologies.js';
import { TopologyId } from '../../../src/domain/level/topology-id.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import { levelExample, levelFrom, valueOf, type LevelJson } from '../../support/level-format.js';

// The Fit strategy of DS-6 (#79). It finds the Topology that the topology of
// the level names and asks FitSection to read the raw section on it.
// FitSection decides every rule, A5 included. The fixtures come from the Fit
// example of the format document.
const HEX = valueOf(TopologyId.of('hex'));

// The strategy as the composition root builds it: it knows the hex topology.
function fitValidator(): FitLevelValidator {
  return new FitLevelValidator(Topologies.of([[valueOf(TopologyId.of('hex')), new HexTopology()]]));
}

// Reads the section of a hex level with the Fit strategy.
function sectionOf(raw: unknown) {
  return fitValidator().sectionOf(raw, HEX);
}

// Builds a level of the format document as the border does, with the Fit strategy.
function fitLevelFrom(json: LevelJson) {
  const topology = valueOf(TopologyId.of(json.topology));
  return levelFrom(json, (raw) => fitValidator().sectionOf(raw, topology));
}

// The Fit section of the format document and its lists, so a test can change one item.
function fitParts() {
  const section = levelExample('fit').section;
  const [pieceA, pieceB, pieceC] = section.pieces as Record<string, unknown>[];
  const [placeA, placeB, placeC] = section.witness as Record<string, unknown>[];
  return { section, pieceA, pieceB, pieceC, placeA, placeB, placeC };
}

describe('FitLevelValidator', () => {
  // The composition root registers the strategy under the Fit gameId.
  it('should_build_the_fit_level_when_the_fit_example_of_the_format_document_is_checked', () => {
    const example = levelExample('fit');
    const validators = LevelValidators.of([[GameId.of('fit'), fitValidator()]]);

    const section = sectionOf(example.section);
    const checked = validators.check(
      GameId.of(example.gameId),
      LevelId.of(example.levelId),
      valueOf(LevelOrder.of(example.order)),
      valueOf(LevelVersion.of(example.version)),
      valueOf(TopologyId.of(example.topology)),
      example.section,
    );

    expect(
      valueOf(section).equals(valueOf(FitSection.of(example.section, new HexTopology()))),
    ).toBe(true);
    expect(fitLevelFrom(example).ok).toBe(true);
    expect(checked.ok).toBe(true);
  });

  // FitSection checks its own shape, and the strategy gives its problem
  // unchanged. No level exists for a rejected section.
  it('should_return_the_problem_of_the_section_when_the_fit_section_has_the_wrong_shape', () => {
    const example = levelExample('fit');
    const section = example.section;
    const { pieces, witness, stars } = section;
    const wrong: unknown[] = [
      null,
      [],
      'section',
      { ...section, extra: true },
      levelExample('sort').section,
      { pieces, witness, stars },
      { ...section, pieces: [] },
      { ...section, witness: [{ piece: 'a', rotation: 0.5, at: [0, 0] }] },
      { ...section, stars: [] },
    ];

    expect(wrong.map((raw) => sectionOf(raw))).toEqual([
      { ok: false, error: 'invalid-section' },
      { ok: false, error: 'invalid-section' },
      { ok: false, error: 'invalid-section' },
      { ok: false, error: 'invalid-section' },
      { ok: false, error: 'invalid-section' },
      { ok: false, error: 'invalid-figure' },
      { ok: false, error: 'invalid-pieces' },
      { ok: false, error: 'invalid-witness' },
      { ok: false, error: 'invalid-stars' },
    ]);
    expect(fitLevelFrom({ ...example, section: { ...section, extra: true } })).toEqual({
      ok: false,
      error: 'invalid-section',
    });
  });

  // Moves.of and ElapsedTime.ofMs throw ProgressError until #103, and return
  // a Result after it. The test asserts only what sectionOf() returns, so it
  // holds in both cases: a bad level file never gives a server error.
  it('should_return_invalid_stars_without_a_throw_when_a_star_threshold_is_negative', () => {
    const example = levelExample('fit');
    const negative = [
      [{ maxMoves: -1, maxElapsedMs: 120000 }],
      [
        { maxMoves: 12, maxElapsedMs: 120000 },
        { maxMoves: 8, maxElapsedMs: -1 },
      ],
    ];
    const read = () => negative.map((stars) => sectionOf({ ...example.section, stars }));

    expect(read).not.toThrow();
    expect(read()).toEqual([
      { ok: false, error: 'invalid-stars' },
      { ok: false, error: 'invalid-stars' },
    ]);
    expect(
      fitLevelFrom({ ...example, section: { ...example.section, stars: negative[1] } }),
    ).toEqual({ ok: false, error: 'invalid-stars' });
  });

  // Decision 6: the strategy finds the Topology with TopologyId.equals(). A
  // topology with no entry has no rotation steps, so A5 cannot run.
  it('should_return_unknown_topology_when_the_strategy_has_no_topology_for_the_level', () => {
    const example = levelExample('fit');
    const square = valueOf(TopologyId.of('square'));
    const knowsNone = new FitLevelValidator(Topologies.of([]));

    expect([
      fitValidator().sectionOf(example.section, square),
      knowsNone.sectionOf(example.section, HEX),
      fitLevelFrom({ ...example, topology: 'square' }),
    ]).toEqual([
      { ok: false, error: 'unknown-topology' },
      { ok: false, error: 'unknown-topology' },
      { ok: false, error: 'unknown-topology' },
    ]);
  });

  // The hex topology reads a cell as [q, r]. A coordinate with another
  // length is a valid Coordinate but not a hex cell, so its field is wrong.
  it('should_return_the_problem_of_the_field_when_a_cell_is_not_a_cell_of_the_topology', () => {
    const { section, pieceA, pieceB, pieceC, placeA, placeB, placeC } = fitParts();
    const figure = section.figure as number[][];

    expect([
      sectionOf({ ...section, figure: [...figure.slice(0, -1), [2, 1, 0]] }),
      sectionOf({ ...section, pieces: [pieceA, pieceB, { ...pieceC, cells: [[0, 0, 0]] }] }),
      sectionOf({ ...section, witness: [placeA, placeB, { ...placeC, at: [1, 1, 0] }] }),
    ]).toEqual([
      { ok: false, error: 'invalid-figure' },
      { ok: false, error: 'invalid-pieces' },
      { ok: false, error: 'invalid-witness' },
    ]);
  });

  // The trap of A5: equal areas are necessary but not enough. Each level here
  // has pieces of 6 cells and a figure of 6 cells.
  it('should_return_inexact_witness_when_the_areas_are_equal_and_the_witness_does_not_cover_the_figure_exactly', () => {
    const { section, placeA, placeB, placeC } = fitParts();
    const example = levelExample('fit');
    const wrong = [
      // b keeps its cells [2, 0] and [3, 0]: [3, 0] lies outside, and [2, 1] stays open.
      [placeA, { ...placeB, rotation: 0 }, placeC],
      // c lies on [0, 0], a cell of a, and [1, 1] stays open.
      [placeA, placeB, { ...placeC, at: [0, 0] }],
      // b turns two steps to [2, 0] and [1, 1], a cell of c.
      [placeA, { ...placeB, rotation: 2 }, placeC],
      // b turns one step the other way to [2, 0] and [3, -1], outside the figure.
      [placeA, { ...placeB, rotation: -1 }, placeC],
    ];

    expect(wrong.map((witness) => sectionOf({ ...section, witness }))).toEqual(
      wrong.map(() => ({ ok: false, error: 'inexact-witness' })),
    );
    expect(fitLevelFrom({ ...example, section: { ...section, witness: wrong[0] } })).toEqual({
      ok: false,
      error: 'inexact-witness',
    });
  });

  // The witness is the solution of the designer: it places each piece once.
  it('should_return_inexact_witness_when_the_witness_does_not_place_each_piece_once', () => {
    const { section, pieceA, pieceB, pieceC, placeA, placeB, placeC } = fitParts();
    const wrong = [
      // An entry names a piece that the level does not have.
      { ...section, witness: [placeA, placeB, { ...placeC, piece: 'z' }] },
      // c is placed twice.
      { ...section, witness: [placeA, placeB, placeC, { ...placeC, at: [3, 0] }] },
      // c is never placed.
      { ...section, witness: [placeA, placeB] },
      // Two pieces have the id a, so the entry a names two pieces.
      {
        ...section,
        pieces: [pieceA, pieceB, { ...pieceC, id: 'a' }],
        witness: [placeA, placeB, { ...placeC, piece: 'a' }],
      },
    ];

    expect(wrong.map((raw) => sectionOf(raw))).toEqual(
      wrong.map(() => ({ ok: false, error: 'inexact-witness' })),
    );
  });

  // A5: the areas of the pieces add up to the area of the figure. A cell that
  // the figure lists twice counts twice.
  it('should_return_unequal_area_when_the_pieces_do_not_have_the_area_of_the_figure', () => {
    const { section, pieceA, pieceB, pieceC } = fitParts();
    const figure = section.figure as number[][];
    const wrong = [
      { ...section, figure: [...figure, [3, 0]] },
      { ...section, figure: [...figure, [0, 0]] },
      {
        ...section,
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
      },
    ];

    expect(wrong.map((raw) => sectionOf(raw))).toEqual(
      wrong.map(() => ({ ok: false, error: 'unequal-area' })),
    );
  });

  // A rotation counts steps of the topology: six steps make a full turn on
  // hex, and a negative count turns the other way. So 7, -5 and the largest
  // safe integer turn b as one step does, and no rotation runs a long loop.
  it('should_build_the_section_when_the_rotation_of_a_piece_differs_from_the_example_by_whole_turns', () => {
    const { section, placeA, placeB, placeC } = fitParts();
    const turns = [7, -5, Number.MAX_SAFE_INTEGER];

    expect(
      turns.map(
        (rotation) =>
          sectionOf({ ...section, witness: [placeA, { ...placeB, rotation }, placeC] }).ok,
      ),
    ).toEqual([true, true, true]);
  });
});
