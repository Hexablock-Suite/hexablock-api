import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import type { PasswordVerifier } from '../../../src/domain/user/password-verifier.js';
import { User } from '../../../src/domain/user/user.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { Username } from '../../../src/domain/user/username.js';
import { type UserParts, userPartsOf } from '../../support/recording-receiver.js';
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
  readonly calls: (readonly [string, PasswordHash])[] = [];

  constructor(private readonly answer: boolean) {}

  verify(typed: string, hash: PasswordHash): Promise<boolean> {
    this.calls.push([typed, hash]);
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
});

// #91: User is an aggregate root that hides its state. Only its factories
// build it. #96: it delivers its parts to a receiver of the border, as a
// value object delivers its datum (decision 15).
describe('User delivery', () => {
  const ID = valueOf(UserId.from(testUserId(1)));
  const NAME = nameOf('Ada');
  const HASH = valueOf(PasswordHash.from('$one'));

  // Vitest does not check types. `pnpm typecheck` fails on a directive below
  // when its field, the constructor or the snapshot is public.
  it('should_have_no_public_field_and_no_public_constructor_when_the_state_is_read_through_the_delivery', () => {
    const user = User.register(ID, NAME, HASH);

    // @ts-expect-error -- #91 makes the id field private.
    void user.id;
    // @ts-expect-error -- #91 makes the username field private.
    void user.username;
    // @ts-expect-error -- #91 makes the passwordHash field private.
    void user.passwordHash;
    // @ts-expect-error -- #91 makes the constructor private, so no public constructor type takes it.
    const open: new (...values: never[]) => User = User;
    void open;
    // @ts-expect-error -- #96 replaces snapshot() with deliverTo().
    void user.snapshot;
    expect('snapshot' in user).toBe(false);
  });

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
      const parts = { id, username: nameOf(name), passwordHash: valueOf(PasswordHash.from(hash)) };

      expect(userPartsOf(User.register(parts.id, parts.username, parts.passwordHash))).toEqual(
        parts,
      );
      expect(userPartsOf(User.restore(parts.id, parts.username, parts.passwordHash))).toEqual(
        parts,
      );
    },
  );
});

// #91: the user checks a typed password, so no caller reads its hash.
describe('User password check', () => {
  it('should_give_the_answer_of_the_verifier_when_a_typed_password_is_checked', async () => {
    const user = userOf(1, 'ada', '$one');

    expect(await user.passwordMatches('correct horse', new RecordingVerifier(true))).toBe(true);
    expect(await user.passwordMatches('correct horse', new RecordingVerifier(false))).toBe(false);
  });

  it('should_pass_the_typed_text_and_its_own_hash_to_the_verifier_when_a_typed_password_is_checked', async () => {
    const hash = valueOf(PasswordHash.from('$one'));
    const user = User.register(valueOf(UserId.from(testUserId(1))), nameOf('ada'), hash);
    const verifier = new RecordingVerifier(true);

    await user.passwordMatches('short', verifier);

    expect(verifier.calls).toHaveLength(1);
    expect(verifier.calls[0][0]).toBe('short');
    expect(verifier.calls[0][1]).toBe(hash);
  });

  it('should_reject_with_the_failure_of_the_verifier_when_the_check_fails', async () => {
    const failure = new Error('hasher is down');
    const user = userOf(1, 'ada', '$one');

    await expect(
      user.passwordMatches('correct horse', { verify: () => Promise.reject(failure) }),
    ).rejects.toBe(failure);
  });
});
