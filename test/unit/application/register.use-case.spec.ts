import { RegisterUseCase } from '../../../src/application/auth/register.use-case.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import {
  InMemoryUserRepository,
  PrefixPasswordHasher,
  SequenceUserIdGenerator,
} from '../../support/auth/fakes.js';
import { testUserId } from '../../support/user-ids.js';

describe('RegisterUseCase', () => {
  let users: InMemoryUserRepository;
  let hasher: PrefixPasswordHasher;
  let register: RegisterUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    hasher = new PrefixPasswordHasher();
    register = new RegisterUseCase(users, hasher, new SequenceUserIdGenerator());
  });

  it('should_store_hashed_password_when_user_registers', async () => {
    const result = await register.execute({ username: 'ada', password: 'correct horse' });

    expect(result).toEqual({ ok: true, value: UserId.from(testUserId(1)) });
    expect(users.users).toHaveLength(1);
    expect(users.users[0].id.value).toBe(testUserId(1));
    expect(users.users[0].username.value).toBe('ada');
    expect(users.users[0].passwordHash.value).toBe('hashed:correct horse');
  });

  it('should_fail_with_username_taken_when_username_exists', async () => {
    await register.execute({ username: 'ada', password: 'correct horse' });

    const result = await register.execute({ username: 'ada', password: 'other password' });

    expect(result).toEqual({ ok: false, error: { kind: 'username-taken' } });
    expect(users.users).toHaveLength(1);
    expect(users.users[0].passwordHash.value).toBe('hashed:correct horse');
  });

  // The name is stored as typed, but a name that differs only in letter
  // case from a stored one is taken (#62).
  it('should_fail_with_username_taken_when_username_differs_only_in_case', async () => {
    await register.execute({ username: 'ada', password: 'correct horse' });

    const result = await register.execute({ username: 'Ada', password: 'other password' });

    expect(result).toEqual({ ok: false, error: { kind: 'username-taken' } });
    expect(users.users).toHaveLength(1);
    expect(users.users[0].username.value).toBe('ada');
    expect(users.users[0].passwordHash.value).toBe('hashed:correct horse');
  });

  it('should_store_username_as_typed_when_it_has_capital_letters', async () => {
    const result = await register.execute({ username: 'AdaLovelace', password: 'correct horse' });

    expect(result).toEqual({ ok: true, value: UserId.from(testUserId(1)) });
    expect(users.users.map((user) => user.username.value)).toEqual(['AdaLovelace']);
  });

  it('should_fail_with_each_invalid_field_when_credentials_break_the_rules', async () => {
    const result = await register.execute({ username: 'a!', password: 'short' });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'invalid-credentials', fields: ['username', 'password'] },
    });
    expect(users.users).toHaveLength(0);
  });

  it('should_not_hash_password_when_username_is_taken', async () => {
    await register.execute({ username: 'ada', password: 'correct horse' });
    const hash = vi.spyOn(hasher, 'hash');

    const result = await register.execute({ username: 'ada', password: 'other password' });

    // The lookup runs before the hash, so a taken username costs no hash work.
    expect(result).toEqual({ ok: false, error: { kind: 'username-taken' } });
    expect(hash).not.toHaveBeenCalled();
    expect(users.users).toHaveLength(1);
  });

  it('should_not_hash_password_when_username_differs_only_in_case', async () => {
    await register.execute({ username: 'ada', password: 'correct horse' });
    const hash = vi.spyOn(hasher, 'hash');

    const result = await register.execute({ username: 'Ada', password: 'other password' });

    // The lookup ignores letter case, so it finds `ada` before the hash runs.
    expect(result).toEqual({ ok: false, error: { kind: 'username-taken' } });
    expect(hash).not.toHaveBeenCalled();
    expect(users.users).toHaveLength(1);
  });

  it('should_reject_without_storing_user_when_password_hasher_fails', async () => {
    const failure = new Error('scrypt failed');
    vi.spyOn(hasher, 'hash').mockRejectedValue(failure);

    // An unexpected failure is not a RegisterProblem. HttpErrorFilter turns it into a 500.
    await expect(register.execute({ username: 'ada', password: 'correct horse' })).rejects.toBe(
      failure,
    );
    expect(users.users).toHaveLength(0);
  });
});
