import { PasswordAttempt } from '../../../src/domain/user/password-attempt.js';
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import type { PasswordVerifier } from '../../../src/domain/user/password-verifier.js';
import { User } from '../../../src/domain/user/user.js';
import { UserId } from '../../../src/domain/shared/user-id.js';
import { Username } from '../../../src/domain/shared/username.js';
import {
  deliveredBy,
  keyDeliveredBy,
  type UserParts,
  userPartsOf,
} from '../../support/recording-receiver.js';
import { testUserId } from '../../support/user-ids.js';
import { valueOf } from '../../support/result.js';

function nameOf(raw: string): Username {
  const result = Username.create(raw);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function userOf(n: number, name: string, hash: string): User {
  return User.register(
    valueOf(UserId.from(testUserId(n))),
    nameOf(name),
    valueOf(PasswordHash.from(hash)),
  );
}

// Test double for the PasswordVerifier interface. It keeps each call and
// gives the answer that the test sets.
class RecordingVerifier implements PasswordVerifier {
  readonly calls: (readonly [PasswordAttempt, PasswordHash])[] = [];

  constructor(private readonly answer: boolean) {}

  verify(attempt: PasswordAttempt, hash: PasswordHash): Promise<boolean> {
    this.calls.push([attempt, hash]);
    return Promise.resolve(this.answer);
  }
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

  // UserId keeps the lower case form of its text (#64), so the letter case
  // of an id does not matter. Postgres gives a uuid in lower case, and a
  // listed level editor id can come in upper case (#145).
  it('should_be_the_same_user_when_the_id_texts_differ_only_in_letter_case', () => {
    const upper = 'ABCDEF01-2345-4678-9ABC-DEF012345678';
    const hash = valueOf(PasswordHash.from('$one'));
    const user = User.register(valueOf(UserId.from(upper)), nameOf('ada'), hash);
    const lower = User.register(valueOf(UserId.from(upper.toLowerCase())), nameOf('ada'), hash);

    expect(user.equals(lower)).toBe(true);
    expect(lower.equals(user)).toBe(true);
  });
});

// #91: User is an aggregate root that hides its state. Only its factories
// build it. #96: it delivers its parts to a receiver of the border, as a
// value object delivers its datum (decision 15).
describe('User delivery', () => {
  const ID = valueOf(UserId.from(testUserId(1)));
  const NAME = nameOf('Ada');
  const HASH = valueOf(PasswordHash.from('$one'));

  it('should_deliver_the_id_the_name_and_the_hash_once_as_domain_values_when_it_delivers_to_a_receiver', () => {
    const user = User.register(ID, NAME, HASH);
    const calls: unknown[][] = [];

    user.deliverTo({
      receive(...parts) {
        calls.push(parts);
      },
    });

    expect(calls).toEqual([[ID, NAME, HASH]]);
    expect(calls[0][0]).toBe(ID);
    expect(calls[0][1]).toBe(NAME);
    expect(calls[0][2]).toBe(HASH);
  });

  // #255: the border receives the value of each part from the delivery of
  // the root: the id in lower case, the name as typed, the key of the name
  // in lower case (#73) and the text of the hash.
  it('should_give_the_border_the_value_of_each_part_when_the_parts_deliver_what_the_user_delivered', () => {
    const user = User.register(
      valueOf(UserId.from('ABCDEF01-2345-4678-9ABC-DEF012345678')),
      nameOf('Ada'),
      valueOf(PasswordHash.from('scrypt$salt$hashbytes')),
    );
    const parts = userPartsOf(user);

    expect(deliveredBy(parts.id)).toEqual(['abcdef01-2345-4678-9abc-def012345678']);
    expect(deliveredBy(parts.username)).toEqual(['Ada']);
    expect(keyDeliveredBy(parts.username)).toEqual(['ada']);
    expect(deliveredBy(parts.passwordHash)).toEqual(['scrypt$salt$hashbytes']);
  });

  // The values are immutable, and the receiver keeps them in a record of its
  // own. A change to that record does not change the user.
  it('should_keep_the_user_unchanged_when_the_receiver_changes_the_record_of_what_it_received', () => {
    const user = User.register(ID, NAME, HASH);
    const copy = userPartsOf(user) as { -readonly [K in keyof UserParts]: UserParts[K] };

    copy.id = valueOf(UserId.from(testUserId(2)));
    copy.username = nameOf('grace');
    copy.passwordHash = valueOf(PasswordHash.from('$two'));

    const parts = userPartsOf(user);
    expect(parts).not.toBe(copy);
    expect(parts.id).toBe(ID);
    expect(parts.username).toBe(NAME);
    expect(parts.passwordHash).toBe(HASH);
    expect(user.equals(User.register(ID, NAME, HASH))).toBe(true);
  });

  it('should_give_an_equal_user_with_the_same_data_when_restored_from_the_values_that_it_delivered', () => {
    const user = User.register(ID, NAME, HASH);
    const { id, username, passwordHash } = userPartsOf(user);

    const restored = User.restore(id, username, passwordHash);

    expect(restored).not.toBe(user);
    expect(restored.equals(user)).toBe(true);
    expect(user.equals(restored)).toBe(true);
    const parts = userPartsOf(restored);
    expect(parts.id).toBe(ID);
    expect(parts.username).toBe(NAME);
    expect(parts.passwordHash).toBe(HASH);
  });

  // The value objects already guard their rules, so the factories add none:
  // every valid id, name and hash builds a user.
  it.each([
    { id: valueOf(UserId.from('00000000-0000-0000-0000-000000000000')), name: 'abc', hash: 'x' },
    { id: valueOf(UserId.from(testUserId(2).toUpperCase())), name: 'A'.repeat(32), hash: '$' },
  ])(
    'should_build_the_user_when_register_and_restore_take_any_valid_values',
    ({ id, name, hash }) => {
      const username = nameOf(name);
      const passwordHash = valueOf(PasswordHash.from(hash));

      // toBe, not toEqual: a structural comparison ignores the ECMAScript
      // private field of a PasswordHash (#138), so it would pass with any hash.
      const registered = userPartsOf(User.register(id, username, passwordHash));
      const restored = userPartsOf(User.restore(id, username, passwordHash));
      expect(registered.id).toBe(id);
      expect(registered.username).toBe(username);
      expect(registered.passwordHash).toBe(passwordHash);
      expect(restored.id).toBe(id);
      expect(restored.username).toBe(username);
      expect(restored.passwordHash).toBe(passwordHash);
    },
  );
});

// #138: a logger or an error body writes an object with JSON.stringify().
// The user holds a PasswordHash, which keeps its text in an ECMAScript
// private field, so JSON shows no hash.
describe('User serialization', () => {
  it('should_show_no_hash_text_when_json_receives_the_user', () => {
    const user = userOf(1, 'ada', 'scrypt$salt$hashbytes');

    expect(JSON.stringify(user)).not.toContain('scrypt$salt$hashbytes');
    expect(JSON.stringify({ user })).not.toContain('scrypt$salt$hashbytes');
    expect(deliveredBy(userPartsOf(user).passwordHash)).toEqual(['scrypt$salt$hashbytes']);
  });
});

// #91: the user checks a typed password, so no caller reads its hash.
// #98: the typed text is a PasswordAttempt, not a string.
describe('User password check', () => {
  const ATTEMPT = PasswordAttempt.of('correct horse');

  it('should_give_the_answer_of_the_verifier_when_a_typed_password_is_checked', async () => {
    const user = userOf(1, 'ada', '$one');

    expect(await user.passwordMatches(ATTEMPT, new RecordingVerifier(true))).toBe(true);
    expect(await user.passwordMatches(ATTEMPT, new RecordingVerifier(false))).toBe(false);
  });

  it('should_pass_the_attempt_and_its_own_hash_to_the_verifier_when_a_typed_password_is_checked', async () => {
    const hash = valueOf(PasswordHash.from('$one'));
    const user = User.register(valueOf(UserId.from(testUserId(1))), nameOf('ada'), hash);
    const verifier = new RecordingVerifier(true);
    const short = PasswordAttempt.of('short');

    await user.passwordMatches(short, verifier);

    expect(verifier.calls).toHaveLength(1);
    expect(verifier.calls[0][0]).toBe(short);
    expect(verifier.calls[0][1]).toBe(hash);
  });

  it('should_reject_with_the_failure_of_the_verifier_when_the_check_fails', async () => {
    const failure = new Error('hasher is down');
    const user = userOf(1, 'ada', '$one');

    await expect(
      user.passwordMatches(ATTEMPT, { verify: () => Promise.reject(failure) }),
    ).rejects.toBe(failure);
  });
});
