import {
  receiveBoundsOf,
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
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import { User, type UserReceiver } from '../../../src/domain/user/user.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { Username } from '../../../src/domain/user/username.js';
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

  // #96: an aggregate delivers its parts in one call. The helper gives the
  // datum of each value object, as the rows and the JSON body keep it.
  it('should_give_the_plain_values_of_the_progress_when_a_progress_delivers_its_parts', () => {
    const at = new Date('2026-11-06T10:05:00.000Z');
    const progress = PlayerProgress.start(
      UserId.from('6F1C1D0E-2B7A-4C55-9A51-0D6C7A1E8F01'),
      GameId.of('fit'),
      at,
    );
    progress.recordScore(Score.of(120), at);
    progress.recordLevel(levelResultOf({ levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45 }));

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
      UserId.from('6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01'),
      GameId.of('lines'),
      at,
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
      UserId.from('6F1C1D0E-2B7A-4C55-9A51-0D6C7A1E8F01'),
      username.value,
      PasswordHash.from('scrypt$hash'),
    );

    expect(receiveUserOf(user)).toEqual({
      id: '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01',
      username: 'Ada',
      usernameKey: 'ada',
      passwordHash: 'scrypt$hash',
    });
  });

  it('should_throw_when_the_aggregate_delivers_no_parts', () => {
    const silentProgress = { deliverTo(_receiver: PlayerProgressReceiver<Date>): void {} };
    const silentUser = { deliverTo(_receiver: UserReceiver): void {} };

    expect(() => receiveProgressOf(silentProgress)).toThrow('The source delivered no value.');
    expect(() => receiveUserOf(silentUser)).toThrow('The source delivered no value.');
  });
});
