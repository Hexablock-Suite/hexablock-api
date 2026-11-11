import { receiveBoundsOf, receiveKeyOf, receiveValueOf } from '../../../src/adapters/received.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { Score } from '../../../src/domain/progress/score.js';
import { Range } from '../../../src/domain/shared/range.js';
import type { ValueReceiver } from '../../../src/domain/shared/value-receiver.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { Username } from '../../../src/domain/user/username.js';

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
});
