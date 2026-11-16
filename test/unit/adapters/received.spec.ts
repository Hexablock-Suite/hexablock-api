import {
  receiveBoundsOf,
  receiveBoundValuesOf,
  receiveJsonOf,
  receiveKeyOf,
  receiveLevelResultOf,
  receiveProgressOf,
  receiveUserOf,
  receiveValueOf,
} from '../../../src/adapters/received.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import type { LevelResultReceiver } from '../../../src/domain/progress/level-result.js';
import {
  PlayerProgress,
  type PlayerProgressReceiver,
} from '../../../src/domain/progress/player-progress.js';
import { Score } from '../../../src/domain/progress/score.js';
import { Range } from '../../../src/domain/shared/range.js';
import type { ValueReceiver } from '../../../src/domain/shared/value-receiver.js';
import { CharacterCount } from '../../../src/domain/user/character-count.js';
import { PASSWORD_LENGTH } from '../../../src/domain/user/password.js';
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import { User, type UserReceiver } from '../../../src/domain/user/user.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { USERNAME_LENGTH, Username } from '../../../src/domain/user/username.js';
import { checkedLevel, levelExample } from '../../support/level-format.js';
import { levelResultOf } from '../../support/level-results.js';
import { valueOf } from '../../support/result.js';
import { syncInstantOf } from '../../support/sync-instants.js';

// The helpers of the border (#90). An adapter needs the value as an
// expression: a row field, an SQL filter, a lock key or a token claim.
describe('received values', () => {
  it('should_give_the_delivered_value_when_a_value_object_delivers_it', () => {
    expect(receiveValueOf(valueOf(Score.of(120)))).toBe(120);
    expect(receiveValueOf(valueOf(GameId.of('fit')))).toBe('fit');
    expect(receiveValueOf(valueOf(UserId.from('6F1C1D0E-2B7A-4C55-9A51-0D6C7A1E8F01')))).toBe(
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
    const min = valueOf(CharacterCount.of(8));
    const max = valueOf(CharacterCount.of(128));

    const bounds = receiveBoundsOf(Range.of(min, max));

    expect(bounds.min).toBe(min);
    expect(bounds.max).toBe(max);
  });

  // #99: a credential range delivers two CharacterCount bounds, and each
  // bound delivers its number. The OpenAPI limits and the messages need the numbers.
  it('should_give_the_value_of_each_bound_when_a_range_of_value_objects_delivers_them', () => {
    expect(receiveBoundValuesOf(USERNAME_LENGTH)).toEqual({ min: 3, max: 32 });
    expect(receiveBoundValuesOf(PASSWORD_LENGTH)).toEqual({ min: 8, max: 128 });
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

  // #96: an aggregate delivers its parts in one call. The helper gives the
  // datum of each value object, as the rows and the JSON body keep it. #97:
  // the SyncInstant delivers its milliseconds, and the helper gives a Date.
  it('should_give_the_plain_values_of_the_progress_when_a_progress_delivers_its_parts', () => {
    const at = new Date('2026-11-06T10:05:00.000Z');
    const progress = PlayerProgress.start(
      valueOf(UserId.from('6F1C1D0E-2B7A-4C55-9A51-0D6C7A1E8F01')),
      valueOf(GameId.of('fit')),
      syncInstantOf(at),
    );
    progress.recordScore(valueOf(Score.of(120)), syncInstantOf(at));
    progress.recordLevel(
      levelResultOf({ levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45 }),
      syncInstantOf(at),
    );

    expect(receiveProgressOf(progress)).toEqual({
      userId: '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01',
      gameId: 'fit',
      highScore: 120,
      updatedAt: at,
      results: [{ levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45 }],
    });
  });

  it('should_give_a_null_high_score_when_the_progress_has_no_score', () => {
    const at = new Date('2026-11-06T10:00:00.000Z');
    const progress = PlayerProgress.start(
      valueOf(UserId.from('6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01')),
      valueOf(GameId.of('lines')),
      syncInstantOf(at),
    );

    expect(receiveProgressOf(progress)).toEqual({
      userId: '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01',
      gameId: 'lines',
      highScore: null,
      updatedAt: at,
      results: [],
    });
  });

  it('should_give_the_id_the_name_the_key_and_the_hash_when_a_user_delivers_its_parts', () => {
    const username = Username.create('Ada');
    if (!username.ok) throw new Error(username.error);
    const user = User.register(
      valueOf(UserId.from('6F1C1D0E-2B7A-4C55-9A51-0D6C7A1E8F01')),
      username.value,
      valueOf(PasswordHash.from('scrypt$hash')),
    );

    expect(receiveUserOf(user)).toEqual({
      id: '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01',
      username: 'Ada',
      usernameKey: 'ada',
      passwordHash: 'scrypt$hash',
    });
  });

  it('should_throw_when_the_aggregate_delivers_no_parts', () => {
    const silentProgress = { deliverTo(_receiver: PlayerProgressReceiver): void {} };
    const silentUser = { deliverTo(_receiver: UserReceiver): void {} };

    expect(() => receiveProgressOf(silentProgress)).toThrow('The source delivered no value.');
    expect(() => receiveUserOf(silentUser)).toThrow('The source delivered no value.');
  });

  // A level and its section deliver their parts, and each part delivers its
  // own value. The helper walks them and gives the shared level format (#80).
  describe('the JSON of a domain value', () => {
    const fixedSort = levelExample('hexa-sort');
    fixedSort.section.source = { stacks: [['red', 'red', 'blue'], ['green'], ['blue', 'green']] };
    it.each([levelExample('hexa-fit'), levelExample('hexa-sort'), fixedSort])(
      'should_give_the_level_of_the_format_document_when_each_example_level_is_received',
      (example) => {
        expect(receiveJsonOf(checkedLevel(example))).toEqual(example);
      },
    );

    it('should_give_each_item_when_lists_and_plain_objects_hold_values', () => {
      expect(
        receiveJsonOf({
          id: valueOf(GameId.of('fit')),
          scores: [valueOf(Score.of(1)), 2],
          name: 'a',
          on: true,
        }),
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
