import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import { User } from '../../../src/domain/user/user.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { Username } from '../../../src/domain/user/username.js';
import { testUserId } from '../../support/user-ids.js';

function nameOf(raw: string): Username {
  const result = Username.create(raw);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function userOf(n: number, name: string, hash: string): User {
  return new User(UserId.from(testUserId(n)), nameOf(name), PasswordHash.from(hash));
}

describe('User identity', () => {
  it('should_be_the_same_user_when_the_ids_match_whatever_the_rest_holds', () => {
    const user = userOf(1, 'ada', '$one');
    const sameId = userOf(1, 'grace', '$two');
    const otherId = userOf(2, 'ada', '$one');

    expect(sameId).not.toBe(user);
    expect(user.equals(sameId)).toBe(true);
    expect(sameId.equals(user)).toBe(true);
    expect(user.equals(otherId)).toBe(false);
    expect(otherId.equals(user)).toBe(false);
  });
});
