import { Coordinate } from '../../../src/domain/level/coordinate.js';
import { Rotation } from '../../../src/domain/level/fit/rotation.js';
import { HexTopology } from '../../../src/domain/level/hex-topology.js';
import { Topologies } from '../../../src/domain/level/topologies.js';
import { TopologyId } from '../../../src/domain/level/topology-id.js';
import { deliveredBy } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/level-format.js';

// The rules of a topology (decision 6): which coordinates are its cells and
// how a rotation turns a cell around the origin. docs/level-format.md gives
// the rules of hex.
const cell = (values: number[]) => valueOf(Coordinate.of(values));
const steps = (count: number) => valueOf(Rotation.of(count));

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
