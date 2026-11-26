import { Rank } from '../../../src/domain/progress/rank.js';
import { RecordingReceiver } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/result.js';

const rank = (value: number): Rank => valueOf(Rank.of(value));

// The rank of one row of a leaderboard. It is a whole number of 1 or more:
// 1 plus the number of rows that are strictly better (#195, option B).
describe('Rank', () => {
  // One failure mechanism (decision 11): a failed Result with the code of
  // the rule, never an exception.
  it.each([0, -1, 1.5])(
    'should_give_the_code_of_the_rule_when_value_is_not_a_whole_number_of_one_or_more',
    (bad) => {
      expect(Rank.of(bad)).toEqual({ ok: false, error: 'invalid-rank' });
    },
  );

  it('should_build_the_rank_when_value_is_one', () => {
    const built = Rank.of(1);
    const receiver = new RecordingReceiver<number>();

    expect(built.ok).toBe(true);
    valueOf(built).deliverTo(receiver);
    expect(receiver.received).toEqual([1]);
  });

  it('should_deliver_the_value_to_the_receiver_when_the_factory_took_it', () => {
    const receiver = new RecordingReceiver<number>();

    rank(3).deliverTo(receiver);

    expect(receiver.received).toEqual([3]);
  });

  it('should_keep_the_value_private_when_the_value_leaves_through_a_delivery', () => {
    const built = rank(1);
    const receiver = new RecordingReceiver<number>();

    // The delivery returns nothing: the receiver holds the value.
    expect(built.deliverTo(receiver)).toBeUndefined();
    expect(receiver.received).toEqual([1]);
  });
});
