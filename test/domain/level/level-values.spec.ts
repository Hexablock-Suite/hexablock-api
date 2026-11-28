import { Coordinate } from '../../../src/domain/level/coordinate.js';
import { LevelOrder } from '../../../src/domain/level/level-order.js';
import { LevelVersion } from '../../../src/domain/level/level-version.js';
import { TopologyId } from '../../../src/domain/level/topology-id.js';
import { deliveredBy } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/level-format.js';

// The values of the common part of a level (DS-6) and the cell of a level.
// Each factory returns a Result: a datum that breaks the rule gives a level
// problem, never an exception (rule «One failure mechanism»).
// The other rules of these values enter through LevelValidators.check() and
// the root LevelDefinition (#255): the delivery of each value, the version
// rule, the TopologyId that finds a topology, and each rule of a cell. The
// cases that stay here cannot enter there, and each one says why.
const NOT_SAFE_INTEGERS = [
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  2 ** 53,
  '1' as unknown as number,
];

// The border builds the values of the common part with these factories
// (LevelDtoMapper), and check() and the root take them built. So the rule of
// each factory stays here. No code of src/ compares two orders or two
// versions, so their equals() cases stay here too.
describe('LevelOrder', () => {
  it('should_deliver_the_place_when_it_is_a_safe_integer_of_1_or_more', () => {
    expect(deliveredBy(valueOf(LevelOrder.of(1)))).toEqual([1]);
    expect(deliveredBy(valueOf(LevelOrder.of(Number.MAX_SAFE_INTEGER)))).toEqual([
      Number.MAX_SAFE_INTEGER,
    ]);
  });

  it('should_return_invalid_order_when_the_place_is_below_1_or_not_a_safe_integer', () => {
    const bad = [0, -1, ...NOT_SAFE_INTEGERS];

    expect(bad.map((value) => LevelOrder.of(value))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-order' })),
    );
  });

  it('should_be_equal_when_two_orders_hold_the_same_place', () => {
    const first = valueOf(LevelOrder.of(3));

    expect(first.equals(valueOf(LevelOrder.of(3)))).toBe(true);
    expect(first.equals(valueOf(LevelOrder.of(4)))).toBe(false);
  });
});

describe('LevelVersion', () => {
  it('should_deliver_the_version_when_it_is_a_safe_integer_of_1_or_more', () => {
    expect(deliveredBy(valueOf(LevelVersion.of(1)))).toEqual([1]);
    expect(deliveredBy(valueOf(LevelVersion.of(12)))).toEqual([12]);
  });

  it('should_return_invalid_version_when_the_version_is_below_1_or_not_a_safe_integer', () => {
    const bad = [0, -1, ...NOT_SAFE_INTEGERS];

    expect(bad.map((value) => LevelVersion.of(value))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-version' })),
    );
  });

  it('should_be_equal_when_two_versions_hold_the_same_number', () => {
    const first = valueOf(LevelVersion.of(2));

    expect(first.equals(valueOf(LevelVersion.of(2)))).toBe(true);
    expect(first.equals(valueOf(LevelVersion.of(3)))).toBe(false);
  });
});

describe('TopologyId', () => {
  // An open value (decision 6): a topology that no code knows yet is a valid id.
  it('should_deliver_the_id_when_it_is_a_lowercase_slug', () => {
    const ids = ['hex', 'square', 'triangle', 'cube-3'];

    expect(ids.map((id) => deliveredBy(valueOf(TopologyId.of(id))))).toEqual(ids.map((id) => [id]));
  });

  it('should_return_invalid_topology_when_the_id_is_not_a_lowercase_slug', () => {
    const bad = ['', 'Hex', 'hex grid', '3d', '-hex', 7 as unknown as string];

    expect(bad.map((id) => TopologyId.of(id))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-topology' })),
    );
  });
});

// A cell enters through check() too: its factory, its negative zero, its
// copy of the raw list, its equals(), its moves and its turns. Two cases
// stay here. The border JSON copies each list, so a delivery through the
// root cannot show that a change to a delivered list leaves the cell as it
// is. A topology checks the length of each cell first, so check() never
// moves or turns a cell by a cell of another length.
describe('Coordinate', () => {
  // A cell with values that the test writes.
  const cellOf = (values: number[]) => valueOf(Coordinate.of(values));

  // The coordinate keeps its own copy, so a change to the raw list or to a
  // delivered list does not change it.
  it('should_keep_its_values_when_the_raw_list_or_a_delivered_list_changes', () => {
    const raw = [1, 2];
    const coordinate = valueOf(Coordinate.of(raw));
    raw[0] = 9;
    const [delivered] = deliveredBy(coordinate);
    (delivered as number[])[1] = 9;

    expect(deliveredBy(coordinate)).toEqual([[1, 2]]);
  });

  // A topology checks the length of each cell first, so cells of two lengths
  // here are a defect of the code, not a datum of a level.
  it('should_throw_when_a_cell_moves_or_turns_by_cells_of_another_length', () => {
    expect(() => cellOf([1, 2]).movedBy(cellOf([1, 2, 3]))).toThrow(
      new RangeError('A cell moves only by an offset of its own length.'),
    );
    expect(() => cellOf([1, 2, 3]).turnedBy([cellOf([0, 1]), cellOf([-1, 1])])).toThrow(
      new RangeError('A cell turns only by one turned unit cell per value, each of its length.'),
    );
    expect(() => cellOf([1, 2]).turnedBy([cellOf([0, 1, 0]), cellOf([-1, 1, 0])])).toThrow(
      new RangeError('A cell turns only by one turned unit cell per value, each of its length.'),
    );
  });
});
