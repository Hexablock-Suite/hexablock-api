import { Coordinate } from '../../../src/domain/level/coordinate.js';
import { LevelOrder } from '../../../src/domain/level/level-order.js';
import { LevelVersion } from '../../../src/domain/level/level-version.js';
import { TopologyId } from '../../../src/domain/level/topology-id.js';
import { deliveredBy } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/level-format.js';

// The values of the common part of a level (DS-6) and the cell of a level.
// Each factory returns a Result: a datum that breaks the rule gives a level
// problem, never an exception (rule «One failure mechanism»).
const NOT_SAFE_INTEGERS = [
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  2 ** 53,
  '1' as unknown as number,
];

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

  // DS-11: the copy with the higher version wins. S3-10: the API rejects a
  // lower version. An equal version is not older.
  it('should_be_older_when_the_version_is_lower', () => {
    const two = valueOf(LevelVersion.of(2));

    expect(valueOf(LevelVersion.of(1)).isOlderThan(two)).toBe(true);
    expect(valueOf(LevelVersion.of(2)).isOlderThan(two)).toBe(false);
    expect(valueOf(LevelVersion.of(3)).isOlderThan(two)).toBe(false);
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

  it('should_be_equal_when_two_ids_hold_the_same_slug', () => {
    const hex = valueOf(TopologyId.of('hex'));

    expect(hex.equals(valueOf(TopologyId.of('hex')))).toBe(true);
    expect(hex.equals(valueOf(TopologyId.of('square')))).toBe(false);
  });
});

describe('Coordinate', () => {
  // The topology says how to read the values: [q, r] for hex, three values for a 3D cell.
  it('should_deliver_the_values_when_they_are_a_list_of_safe_integers', () => {
    expect(deliveredBy(valueOf(Coordinate.of([0, 0])))).toEqual([[0, 0]]);
    expect(deliveredBy(valueOf(Coordinate.of([-2, 3])))).toEqual([[-2, 3]]);
    expect(deliveredBy(valueOf(Coordinate.of([1, 2, 3])))).toEqual([[1, 2, 3]]);
  });

  it('should_deliver_zero_when_a_value_is_a_negative_zero', () => {
    const [values] = deliveredBy(valueOf(Coordinate.of([-0, 1])));

    expect(Object.is(values[0], 0)).toBe(true);
  });

  it('should_return_invalid_coordinate_when_the_raw_value_is_not_a_list_of_safe_integers', () => {
    const bad: unknown[] = [[], [1.5, 0], ['0', 0], [Number.NaN, 0], [2 ** 53, 0], '0,0', null, {}];

    expect(bad.map((raw) => Coordinate.of(raw))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-coordinate' })),
    );
  });

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

  it('should_be_equal_when_two_coordinates_hold_the_same_values_in_the_same_order', () => {
    const cell = valueOf(Coordinate.of([1, 2]));

    expect(cell.equals(valueOf(Coordinate.of([1, 2])))).toBe(true);
    expect(cell.equals(valueOf(Coordinate.of([2, 1])))).toBe(false);
    expect(cell.equals(valueOf(Coordinate.of([1, 2, 0])))).toBe(false);
  });
});
