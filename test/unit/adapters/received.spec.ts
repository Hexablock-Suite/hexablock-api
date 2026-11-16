import {
  receiveBoundsOf,
  receiveJsonOf,
  receiveKeyOf,
  receiveLevelResultOf,
  receiveValueOf,
} from '../../../src/adapters/received.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import type { LevelResultReceiver } from '../../../src/domain/progress/level-result.js';
import { Score } from '../../../src/domain/progress/score.js';
import { Range } from '../../../src/domain/shared/range.js';
import type { ValueReceiver } from '../../../src/domain/shared/value-receiver.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { Username } from '../../../src/domain/user/username.js';
import { checkedLevel, levelExample } from '../../support/level-format.js';
import { levelResultOf } from '../../support/level-results.js';

// The helpers of the border (#90). An adapter needs the value as an
// expression: a row field, an SQL filter, a lock key or a token claim.
describe('received values', () => {
  it('should_give_the_delivered_value_when_a_value_object_delivers_it', () => {
    expect(receiveValueOf(Score.of(120))).toBe(120);
    expect(receiveValueOf(GameId.of('fit'))).toBe('fit');
    expect(receiveValueOf(UserId.from('6F1C1D0E-2B7A-4C55-9A51-0D6C7A1E8F01'))).toBe(
      '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01',
    );
  });

  it('should_give_the_key_when_a_username_delivers_its_key', () => {
    const username = Username.create('Ada');

    expect(username.ok && [receiveValueOf(username.value), receiveKeyOf(username.value)]).toEqual([
      'Ada',
      'ada',
    ]);
  });

  it('should_give_both_bounds_when_a_range_delivers_them', () => {
    expect(receiveBoundsOf(Range.ofNumbers(8, 128))).toEqual({ min: 8, max: 128 });
  });

  it('should_throw_when_the_source_delivers_no_value', () => {
    const silent = { deliverTo(_receiver: ValueReceiver<string>): void {} };

    expect(() => receiveValueOf(silent)).toThrow('The source delivered no value.');
  });

  // #95: a LevelResult delivers its four value objects in one call. The
  // helper gives the text and the three numbers of a row or a JSON body.
  it('should_give_the_four_plain_values_when_a_level_result_delivers_them', () => {
    const result = levelResultOf({ levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45_000 });

    expect(receiveLevelResultOf(result)).toEqual({
      levelId: 'fit-01',
      stars: 3,
      moves: 12,
      elapsedMs: 45_000,
    });
  });

  it('should_throw_when_the_level_result_delivers_no_values', () => {
    const silent = { deliverTo(_receiver: LevelResultReceiver): void {} };

    expect(() => receiveLevelResultOf(silent)).toThrow('The source delivered no value.');
  });

  // A level and its section deliver their parts, and each part delivers its
  // own value. The helper walks them and gives the shared level format (#80).
  describe('the JSON of a domain value', () => {
    it('should_give_the_level_of_the_format_document_when_each_example_level_is_received', () => {
      const fixedSort = levelExample('hexa-sort');
      fixedSort.section.source = { stacks: [['red', 'red', 'blue'], ['green'], ['blue', 'green']] };

      for (const example of [levelExample('hexa-fit'), levelExample('hexa-sort'), fixedSort]) {
        expect(receiveJsonOf(checkedLevel(example))).toEqual(example);
      }
    });

    it('should_give_each_item_when_lists_and_plain_objects_hold_values', () => {
      expect(
        receiveJsonOf({ id: GameId.of('fit'), scores: [Score.of(1), 2], name: 'a', on: true }),
      ).toEqual({ id: 'fit', scores: [1, 2], name: 'a', on: true });
      expect(receiveJsonOf(null)).toBeNull();
    });

    // A class instance that delivers nothing would show its private fields.
    it('should_throw_when_an_object_is_neither_plain_nor_a_delivering_value', () => {
      class Secret {
        private readonly hidden = 'hidden';
      }

      expect(() => receiveJsonOf({ part: new Secret() })).toThrow(
        'The value is not JSON and delivers no value.',
      );
      expect(() => receiveJsonOf(new Date(0))).toThrow(
        'The value is not JSON and delivers no value.',
      );
    });
  });
});
