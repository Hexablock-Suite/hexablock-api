import { Coordinate } from '../../../src/domain/level/coordinate.js';
import { HexTopology } from '../../../src/domain/level/hex-topology.js';
import { Rotation } from '../../../src/domain/level/rotation.js';
import { SquareTopology } from '../../../src/domain/level/square-topology.js';
import { Topologies } from '../../../src/domain/level/topologies.js';
import type { Topology } from '../../../src/domain/level/topology.js';
import { TopologyId } from '../../../src/domain/level/topology-id.js';
import { TriangleTopology } from '../../../src/domain/level/triangle-topology.js';
import { deliveredBy } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/level-format.js';

// The rules of a topology (decision 6): which coordinates are its cells, how
// a rotation turns a cell around the origin, and how an offset moves a cell.
// docs/level-format.md gives the rules of hex, square and triangle.
const cell = (values: number[]) => valueOf(Coordinate.of(values));
const steps = (count: number) => valueOf(Rotation.of(count));

// The cells that each cell becomes after `count` steps of the topology.
const turned = (topology: Topology, cells: number[][], count: number) =>
  cells.map((values) => deliveredBy(topology.turn(cell(values), steps(count))));

// The cells that each cell becomes when it moves by its offset.
const moved = (topology: Topology, moves: [number[], number[]][]) =>
  moves.map(([values, at]) => deliveredBy(topology.move(cell(values), cell(at))));

describe('HexTopology', () => {
  it('should_hold_a_cell_when_the_coordinate_has_two_values', () => {
    const hex = new HexTopology();

    expect([[0, 0], [-3, 7], [0], [0, 0, 0]].map((values) => hex.holds(cell(values)))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  // One step is a sixth of a turn: [q, r] turns to [-r, q + r].
  it('should_turn_q_r_to_minus_r_q_plus_r_when_a_cell_turns_one_step', () => {
    const hex = new HexTopology();
    const cells = [
      [1, 0],
      [0, 1],
      [2, -1],
      [0, 0],
    ];

    expect(cells.map((values) => deliveredBy(hex.turn(cell(values), steps(1))))).toEqual([
      [[0, 1]],
      [[-1, 1]],
      [[1, 1]],
      [[0, 0]],
    ]);
  });

  // Six steps make a full turn, and a negative count turns the other way. A
  // count turns only the steps left after its whole turns, so the largest
  // safe integer runs no long loop.
  it('should_turn_the_steps_left_after_whole_turns_when_the_count_is_negative_or_a_full_turn_or_more', () => {
    const hex = new HexTopology();
    const counts = [0, 2, 6, 7, -1, -6, Number.MAX_SAFE_INTEGER];

    expect(counts.map((count) => deliveredBy(hex.turn(cell([1, 0]), steps(count))))).toEqual([
      [[1, 0]],
      [[-1, 1]],
      [[1, 0]],
      [[0, 1]],
      [[1, -1]],
      [[1, 0]],
      [[0, 1]],
    ]);
  });
});

describe('HexTopology moves', () => {
  // An offset of hex adds one value at a time, as the Fit example of
  // docs/level-format.md places piece b at [2, 0].
  it('should_add_the_offset_to_each_value_when_a_hex_cell_moves', () => {
    expect(
      moved(new HexTopology(), [
        [
          [0, 1],
          [2, 0],
        ],
        [
          [1, -2],
          [-3, 4],
        ],
      ]),
    ).toEqual([[[2, 1]], [[-2, 2]]]);
  });
});

describe('SquareTopology', () => {
  it('should_hold_a_cell_when_the_coordinate_has_two_values', () => {
    const square = new SquareTopology();

    expect([[0, 0], [-3, 7], [0], [0, 0, 0]].map((values) => square.holds(cell(values)))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  // One step is a quarter turn: [col, row] turns to [-row, col], as
  // SquareCoord.turned() of the app does.
  it('should_turn_col_row_to_minus_row_col_when_a_cell_turns_one_step', () => {
    expect(
      turned(
        new SquareTopology(),
        [
          [1, 0],
          [0, 1],
          [2, 3],
          [0, 0],
        ],
        1,
      ),
    ).toEqual([[[0, 1]], [[-1, 0]], [[-3, 2]], [[0, 0]]]);
  });

  // Four steps make a full turn, and a negative count turns the other way.
  it('should_turn_the_steps_left_after_whole_turns_when_the_count_is_negative_or_a_full_turn_or_more', () => {
    const square = new SquareTopology();
    const counts = [0, 2, 4, 5, -1, Number.MAX_SAFE_INTEGER];

    expect(counts.map((count) => deliveredBy(square.turn(cell([1, 0]), steps(count))))).toEqual([
      [[1, 0]],
      [[-1, 0]],
      [[1, 0]],
      [[0, 1]],
      [[0, -1]],
      [[0, -1]],
    ]);
  });

  it('should_add_the_offset_to_each_value_when_a_square_cell_moves', () => {
    expect(
      moved(new SquareTopology(), [
        [
          [0, 1],
          [2, 0],
        ],
        [
          [1, -2],
          [-3, 4],
        ],
      ]),
    ).toEqual([[[2, 1]], [[-2, 2]]]);
  });
});

describe('TriangleTopology', () => {
  it('should_hold_a_cell_when_the_coordinate_has_two_values', () => {
    const triangle = new TriangleTopology();

    expect([[0, 0], [-3, 7], [0], [0, 0, 0]].map((values) => triangle.holds(cell(values)))).toEqual(
      [true, true, false, false],
    );
  });

  // One step is a sixth of a turn around the vertex at the origin, as
  // TriangleCoord.turned() of the app does. The six triangles around that
  // vertex follow each other, and each step flips the orientation: a cell
  // with an even col + row points up, and an odd one points down.
  it('should_take_each_triangle_to_the_next_one_around_the_origin_vertex_when_a_cell_turns_one_step', () => {
    expect(
      turned(
        new TriangleTopology(),
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [2, 1],
          [1, 1],
          [0, 1],
          [-1, 1],
          [3, 2],
          [-2, -3],
        ],
        1,
      ),
    ).toEqual([
      [[1, 0]],
      [[2, 0]],
      [[2, 1]],
      [[1, 1]],
      [[0, 1]],
      [[0, 0]],
      [[-1, 0]],
      [[0, 2]],
      [[5, -3]],
    ]);
  });

  // Six steps make a full turn, and a negative count turns the other way.
  it('should_turn_the_steps_left_after_whole_turns_when_the_count_is_negative_or_a_full_turn_or_more', () => {
    const triangle = new TriangleTopology();
    const counts = [0, 2, 6, 7, -1, Number.MAX_SAFE_INTEGER];

    expect(counts.map((count) => deliveredBy(triangle.turn(cell([0, 0]), steps(count))))).toEqual([
      [[0, 0]],
      [[2, 0]],
      [[0, 0]],
      [[1, 0]],
      [[0, 1]],
      [[1, 0]],
    ]);
  });

  // An offset counts lattice cells: one step of col is two triangles to the
  // right, and one step of row is one row down and one triangle to the
  // right. So a move never flips a triangle, as TriangleCoord.translated()
  // of the app does. A plain sum of the values would take [0, 0] by [1, 0]
  // to the down triangle [1, 0].
  it('should_keep_the_orientation_when_a_triangle_moves_by_a_lattice_offset', () => {
    expect(
      moved(new TriangleTopology(), [
        [
          [0, 0],
          [1, 0],
        ],
        [
          [0, 0],
          [0, 1],
        ],
        [
          [1, 0],
          [-1, 1],
        ],
        [
          [0, 1],
          [-1, 1],
        ],
      ]),
    ).toEqual([[[2, 0]], [[1, 1]], [[0, 1]], [[-1, 2]]]);
  });
});

describe('Topologies', () => {
  // A Map compares object keys by reference, so a TopologyId built again
  // would find nothing. The collection compares with TopologyId.equals().
  it('should_find_the_topology_when_the_same_topology_id_is_built_twice', () => {
    const hex = new HexTopology();
    const topologies = Topologies.of([[valueOf(TopologyId.of('hex')), hex]]);

    const found = topologies.find(valueOf(TopologyId.of('hex')));

    expect(found).toEqual({ ok: true, value: hex });
    expect(valueOf(found)).toBe(hex);
  });

  it('should_return_unknown_topology_when_no_entry_has_the_topology_id', () => {
    const topologies = Topologies.of([[valueOf(TopologyId.of('hex')), new HexTopology()]]);

    expect([
      topologies.find(valueOf(TopologyId.of('square'))),
      Topologies.of([]).find(valueOf(TopologyId.of('hex'))),
    ]).toEqual([
      { ok: false, error: 'unknown-topology' },
      { ok: false, error: 'unknown-topology' },
    ]);
  });

  // Two entries for one topology are a defect of the composition root, not a
  // datum of a level, so the factory throws.
  it('should_throw_when_two_entries_name_one_topology', () => {
    const entries = [
      [valueOf(TopologyId.of('hex')), new HexTopology()],
      [valueOf(TopologyId.of('hex')), new HexTopology()],
    ] as const;

    expect(() => Topologies.of(entries)).toThrow(
      new RangeError('Topologies takes one topology per topologyId.'),
    );
  });
});
