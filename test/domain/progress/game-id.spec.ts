import { GameId } from '../../../src/domain/progress/game-id.js';
import { ProgressError } from '../../../src/domain/progress/progress-error.js';
import { RecordingReceiver } from '../../support/recording-receiver.js';

describe('GameId', () => {
  it('should_accept_each_variant_when_value_names_lines_fit_sort_or_merge', () => {
    const receiver = new RecordingReceiver<string>();

    for (const value of ['lines', 'fit', 'sort', 'merge']) {
      GameId.of(value).deliverTo(receiver);
    }

    expect(receiver.received).toEqual(['lines', 'fit', 'sort', 'merge']);
  });

  // GameId is an open value (classes.md decision 5): a new variant needs no code change.
  it('should_accept_a_new_variant_when_value_is_a_lowercase_slug', () => {
    const receiver = new RecordingReceiver<string>();

    GameId.of('tri-fit2').deliverTo(receiver);

    expect(receiver.received).toEqual(['tri-fit2']);
  });

  it('should_reject_game_id_when_value_is_missing_empty_or_not_a_slug', () => {
    for (const value of [undefined, null, '', '  ', 'Lines', 'fit sort', '-fit', 7]) {
      expect(() => GameId.of(value as unknown as string)).toThrow(ProgressError);
    }
  });

  it('should_be_equal_when_two_game_ids_hold_the_same_value', () => {
    expect(GameId.of('fit').equals(GameId.of('fit'))).toBe(true);
    expect(GameId.of('fit').equals(GameId.of('sort'))).toBe(false);
  });

  // #90: the value leaves only through a delivery to a receiver.
  it('should_deliver_the_value_to_the_receiver_when_the_factory_took_it', () => {
    const receiver = new RecordingReceiver<string>();

    GameId.of('fit').deliverTo(receiver);

    expect(receiver.received).toEqual(['fit']);
  });

  it('should_have_no_public_value_field_when_the_value_leaves_through_a_delivery', () => {
    const gameId = GameId.of('fit');
    const receiver = new RecordingReceiver<string>();

    // @ts-expect-error -- #90 makes the value private.
    void gameId.value;
    // The delivery returns nothing: the receiver holds the value.
    expect(gameId.deliverTo(receiver)).toBeUndefined();
  });
});
