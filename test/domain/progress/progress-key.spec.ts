import { GameId } from '../../../src/domain/progress/game-id.js';
import { ProgressKey } from '../../../src/domain/progress/progress-key.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { testUserId } from '../../support/user-ids.js';
import { valueOf } from '../../support/result.js';

const USER = valueOf(UserId.from(testUserId(1)));
const FIT = valueOf(GameId.of('fit'));

// #107: the identity of a PlayerProgress is a value object of its own. It
// holds the UserId and the GameId, one progress per pair (API-FR-02, DS-5).
describe('ProgressKey', () => {
  // #128: of() returns a Result, as the factory of every value object does
  // (rule «One failure mechanism», decision 11). No pair of built parts
  // breaks a rule, so the Result is always ok and holds the key.
  it('should_return_an_ok_result_with_the_key_when_it_takes_a_built_user_id_and_game_id', () => {
    const key = ProgressKey.of(USER, FIT);
    const calls: unknown[][] = [];

    expect(key.ok).toBe(true);
    const value = valueOf(key);
    expect(value).toBeInstanceOf(ProgressKey);
    value.deliverTo({
      receive(...parts) {
        calls.push(parts);
      },
    });
    expect(calls).toHaveLength(1);
    const [userId, gameId] = calls[0];
    expect((userId as UserId).equals(USER)).toBe(true);
    expect((gameId as GameId).equals(FIT)).toBe(true);
  });

  it('should_be_the_same_key_when_built_again_from_an_equal_user_and_game', () => {
    const key = valueOf(ProgressKey.of(USER, FIT));
    const again = valueOf(
      ProgressKey.of(valueOf(UserId.from(testUserId(1))), valueOf(GameId.of('fit'))),
    );

    expect(again).not.toBe(key);
    expect(key.equals(again)).toBe(true);
    expect(again.equals(key)).toBe(true);
  });

  it.each([
    [valueOf(UserId.from(testUserId(2))), FIT],
    [USER, valueOf(GameId.of('sort'))],
  ])('should_not_be_the_same_key_when_the_user_or_the_game_differs', (userId, gameId) => {
    const key = valueOf(ProgressKey.of(USER, FIT));
    const other = valueOf(ProgressKey.of(userId, gameId));

    expect(key.equals(other)).toBe(false);
    expect(other.equals(key)).toBe(false);
  });

  // The key delivers its two parts to a receiver of the border, as a value
  // object delivers its datum (decision 15). No operation returns them.
  it('should_deliver_its_user_id_and_game_id_once_when_it_delivers_to_a_receiver', () => {
    const calls: unknown[][] = [];

    valueOf(ProgressKey.of(USER, FIT)).deliverTo({
      receive(...parts) {
        calls.push(parts);
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(2);
    const [userId, gameId] = calls[0];
    expect(userId).toBeInstanceOf(UserId);
    expect((userId as UserId).equals(USER)).toBe(true);
    expect(gameId).toBeInstanceOf(GameId);
    expect((gameId as GameId).equals(FIT)).toBe(true);
  });

  // UserId and GameId guard their own rules, so the factory takes them
  // built, and its Result is always ok. An argument of another type is a
  // defect of the caller, not a broken rule of a value, so the guard throws
  // (decision 11).
  it.each([
    [undefined as unknown as UserId, FIT, 'A progress needs a userId.'],
    [testUserId(1) as unknown as UserId, FIT, 'A progress needs a userId.'],
    [USER, undefined as unknown as GameId, 'A progress needs a gameId.'],
    [USER, 'fit' as unknown as GameId, 'A progress needs a gameId.'],
  ])(
    'should_throw_a_type_error_when_the_user_id_or_the_game_id_is_missing',
    (userId, gameId, message) => {
      expect(() => ProgressKey.of(userId, gameId)).toThrow(new TypeError(message));
    },
  );
});
