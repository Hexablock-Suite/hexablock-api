import { Rank } from '../../../src/domain/progress/rank.js';
import { RecordingReceiver } from '../../support/recording-receiver.js';

describe('Rank', () => {
  it('should_deliver_the_value_to_the_receiver_when_the_factory_took_it', () => {
    const receiver = new RecordingReceiver<number>();

    Rank.of(3).deliverTo(receiver);

    expect(receiver.received).toEqual([3]);
  });

  it('should_keep_the_value_private_when_the_value_leaves_through_a_delivery', () => {
    const built = Rank.of(1);
    const receiver = new RecordingReceiver<number>();

    // The delivery returns nothing: the receiver holds the value.
    expect(built.deliverTo(receiver)).toBeUndefined();
    expect(receiver.received).toEqual([1]);
  });
});
