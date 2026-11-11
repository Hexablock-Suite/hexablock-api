import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import type { PasswordVerifier } from '../../../src/domain/user/password-verifier.js';
import { User, type UserState } from '../../../src/domain/user/user.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { Username } from '../../../src/domain/user/username.js';
import { testUserId } from '../../support/user-ids.js';

function nameOf(raw: string): Username {
  const result = Username.create(raw);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function userOf(n: number, name: string, hash: string): User {
  return User.register(UserId.from(testUserId(n)), nameOf(name), PasswordHash.from(hash));
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
// build it, and snapshot() gives a copy of the state.
describe('User state', () => {
  const ID = UserId.from(testUserId(1));
  const NAME = nameOf('Ada');
  const HASH = PasswordHash.from('$one');

  // Vitest does not check types. `pnpm typecheck` fails on a directive below
  // when its field or the constructor is public.
  it('should_have_no_public_field_and_no_public_constructor_when_the_state_is_read_through_the_snapshot', () => {
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
    expect(user.snapshot()).not.toBe(user);
  });

  it('should_give_the_id_the_name_and_the_hash_as_domain_values_when_the_snapshot_is_read', () => {
    const user = User.register(ID, NAME, HASH);

    const state = user.snapshot();

    expect(Object.keys(state).sort()).toEqual(['id', 'passwordHash', 'username']);
    expect(state.id).toBe(ID);
    expect(state.username).toBe(NAME);
    expect(state.passwordHash).toBe(HASH);
  });

  it('should_keep_the_user_unchanged_when_the_copy_of_the_state_changes', () => {
    const user = User.register(ID, NAME, HASH);
    const copy = user.snapshot() as { -readonly [K in keyof UserState]: UserState[K] };

    copy.id = UserId.from(testUserId(2));
    copy.username = nameOf('grace');
    copy.passwordHash = PasswordHash.from('$two');

    const state = user.snapshot();
    expect(state).not.toBe(copy);
    expect(state.id).toBe(ID);
    expect(state.username).toBe(NAME);
    expect(state.passwordHash).toBe(HASH);
    expect(user.equals(User.register(ID, NAME, HASH))).toBe(true);
  });

  it('should_give_an_equal_user_with_the_same_data_when_a_snapshot_is_restored', () => {
    const user = User.register(ID, NAME, HASH);

    const restored = User.restore(user.snapshot());

    expect(restored).not.toBe(user);
    expect(restored.equals(user)).toBe(true);
    expect(user.equals(restored)).toBe(true);
    const state = restored.snapshot();
    expect(state.id).toBe(ID);
    expect(state.username).toBe(NAME);
    expect(state.passwordHash).toBe(HASH);
  });

  // The value objects already guard their rules, so the factories add none:
  // every valid id, name and hash builds a user.
  it('should_build_the_user_when_register_and_restore_take_any_valid_values', () => {
    const cases = [
      { id: UserId.from('00000000-0000-0000-0000-000000000000'), name: 'abc', hash: 'x' },
      { id: UserId.from(testUserId(2).toUpperCase()), name: 'A'.repeat(32), hash: '$' },
    ];

    for (const { id, name, hash } of cases) {
      const state = { id, username: nameOf(name), passwordHash: PasswordHash.from(hash) };

      expect(User.register(state.id, state.username, state.passwordHash).snapshot()).toEqual(state);
      expect(User.restore(state).snapshot()).toEqual(state);
    }
  });
});

// #91: the user checks a typed password, so no caller reads its hash.
describe('User password check', () => {
  it('should_give_the_answer_of_the_verifier_when_a_typed_password_is_checked', async () => {
    const user = userOf(1, 'ada', '$one');

    expect(await user.passwordMatches('correct horse', new RecordingVerifier(true))).toBe(true);
    expect(await user.passwordMatches('correct horse', new RecordingVerifier(false))).toBe(false);
  });

  it('should_pass_the_typed_text_and_its_own_hash_to_the_verifier_when_a_typed_password_is_checked', async () => {
    const hash = PasswordHash.from('$one');
    const user = User.register(UserId.from(testUserId(1)), nameOf('ada'), hash);
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
