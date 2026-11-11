import { RegisterUseCase } from '../../../src/application/auth/register.use-case.js';
import { receiveValueOf } from '../../../src/adapters/received.js';
import { Password } from '../../../src/domain/user/password.js';
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
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
    expect(receiveValueOf(users.users[0].snapshot().id)).toBe(testUserId(1));
    expect(receiveValueOf(users.users[0].snapshot().username)).toBe('ada');
    expect(receiveValueOf(users.users[0].snapshot().passwordHash)).toBe('hashed:correct horse');
  });

  // #90: the port carries domain types, so the use case reads no text.
  it('should_pass_a_password_to_the_hasher_and_store_its_password_hash_when_user_registers', async () => {
    const hash = vi.spyOn(hasher, 'hash');

    await register.execute({ username: 'ada', password: 'correct horse' });

    expect(hash).toHaveBeenCalledOnce();
    const [password] = hash.mock.calls[0];
    expect(password).toBeInstanceOf(Password);
    expect(Password.create('correct horse')).toEqual({ ok: true, value: password });
    const made = await hash.mock.results[0].value;
    expect(made).toBeInstanceOf(PasswordHash);
    expect(users.users[0].snapshot().passwordHash).toBe(made);
  });

  it('should_fail_with_username_taken_when_username_exists', async () => {
    await register.execute({ username: 'ada', password: 'correct horse' });

    const result = await register.execute({ username: 'ada', password: 'other password' });

    expect(result).toEqual({ ok: false, error: { kind: 'username-taken' } });
    expect(users.users).toHaveLength(1);
    expect(receiveValueOf(users.users[0].snapshot().passwordHash)).toBe('hashed:correct horse');
  });

  // The name is stored as typed, but a name that differs only in letter
  // case from a stored one is taken (#62).
  it('should_fail_with_username_taken_when_username_differs_only_in_case', async () => {
    await register.execute({ username: 'ada', password: 'correct horse' });

    const result = await register.execute({ username: 'Ada', password: 'other password' });

    expect(result).toEqual({ ok: false, error: { kind: 'username-taken' } });
    expect(users.users).toHaveLength(1);
    expect(receiveValueOf(users.users[0].snapshot().username)).toBe('ada');
    expect(receiveValueOf(users.users[0].snapshot().passwordHash)).toBe('hashed:correct horse');
  });

  it('should_store_username_as_typed_when_it_has_capital_letters', async () => {
    const result = await register.execute({ username: 'AdaLovelace', password: 'correct horse' });

    expect(result).toEqual({ ok: true, value: UserId.from(testUserId(1)) });
    expect(users.users.map((user) => receiveValueOf(user.snapshot().username))).toEqual([
      'AdaLovelace',
    ]);
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
