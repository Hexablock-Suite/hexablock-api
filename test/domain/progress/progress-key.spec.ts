import { GameId } from '../../../src/domain/progress/game-id.js';
import { ProgressKey } from '../../../src/domain/progress/progress-key.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { testUserId } from '../../support/user-ids.js';
import { valueOf } from '../../support/result.js';

const USER = valueOf(UserId.from(testUserId(1)));
const FIT = valueOf(GameId.of('fit'));

// #107: the identity of a PlayerProgress is a value object of its own. It
// holds the UserId and the GameId, one progress per pair (API-FR-02, DS-5).
// The PlayerProgress spec pins its factory, its equality and its delivery
// through the root (#255). The root takes the key built, so this spec keeps
// the guards of the factory.
describe('ProgressKey', () => {
  // UserId and GameId guard their own rules, so the factory takes them
  // built, and no pair of them fails. An argument of another type is a
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
