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
import { registerRequest } from '../../support/auth/requests.js';
import { userPartsOf } from '../../support/recording-receiver.js';
import { testUserId } from '../../support/user-ids.js';
import { valueOf } from '../../support/result.js';

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
    const result = await register.execute(registerRequest('ada', 'correct horse'));

    expect(result).toEqual({ ok: true, value: valueOf(UserId.from(testUserId(1))) });
    expect(users.users).toHaveLength(1);
    expect(receiveValueOf(userPartsOf(users.users[0]).id)).toBe(testUserId(1));
    expect(receiveValueOf(userPartsOf(users.users[0]).username)).toBe('ada');
    expect(receiveValueOf(userPartsOf(users.users[0]).passwordHash)).toBe('hashed:correct horse');
  });

  // #90: the port carries domain types, so the use case reads no text.
  it('should_pass_a_password_to_the_hasher_and_store_its_password_hash_when_user_registers', async () => {
    const hash = vi.spyOn(hasher, 'hash');

    await register.execute(registerRequest('ada', 'correct horse'));

    expect(hash).toHaveBeenCalledOnce();
    const [password] = hash.mock.calls[0];
    expect(password).toBeInstanceOf(Password);
    expect(password.equals(valueOf(Password.create('correct horse')))).toBe(true);
    const made = await hash.mock.results[0].value;
    expect(made).toBeInstanceOf(PasswordHash);
    expect(userPartsOf(users.users[0]).passwordHash).toBe(made);
  });

  it('should_fail_with_username_taken_when_username_exists', async () => {
    await register.execute(registerRequest('ada', 'correct horse'));

    const result = await register.execute(registerRequest('ada', 'other password'));

    expect(result).toEqual({ ok: false, error: { kind: 'username-taken' } });
    expect(users.users).toHaveLength(1);
    expect(receiveValueOf(userPartsOf(users.users[0]).passwordHash)).toBe('hashed:correct horse');
  });

  // The name is stored as typed, but a name that differs only in letter
  // case from a stored one is taken (#62).
  it('should_fail_with_username_taken_when_username_differs_only_in_case', async () => {
    await register.execute(registerRequest('ada', 'correct horse'));

    const result = await register.execute(registerRequest('Ada', 'other password'));

    expect(result).toEqual({ ok: false, error: { kind: 'username-taken' } });
    expect(users.users).toHaveLength(1);
    expect(receiveValueOf(userPartsOf(users.users[0]).username)).toBe('ada');
    expect(receiveValueOf(userPartsOf(users.users[0]).passwordHash)).toBe('hashed:correct horse');
  });

  it('should_store_username_as_typed_when_it_has_capital_letters', async () => {
    const result = await register.execute(registerRequest('AdaLovelace', 'correct horse'));

    expect(result).toEqual({ ok: true, value: valueOf(UserId.from(testUserId(1))) });
    expect(users.users.map((user) => receiveValueOf(userPartsOf(user).username))).toEqual([
      'AdaLovelace',
    ]);
  });

  // #105: AuthDtoMapper builds the Username and the Password, so a value that
  // breaks its rule never reaches the use case. The use case passes the
  // values of the request to its ports and to the new User, and builds no
  // value from a request field.
  it('should_pass_the_username_and_the_password_of_the_request_to_the_ports_when_user_registers', async () => {
    const taken = vi.spyOn(users, 'isUsernameTaken');
    const hash = vi.spyOn(hasher, 'hash');
    const request = registerRequest('ada', 'correct horse');

    const result = await register.execute(request);

    expect(result).toEqual({ ok: true, value: valueOf(UserId.from(testUserId(1))) });
    // The first call is the lookup of the use case. The fake add() asks again.
    expect(taken.mock.calls[0][0]).toBe(request.username);
    expect(hash).toHaveBeenCalledOnce();
    expect(hash.mock.calls[0][0]).toBe(request.password);
    expect(userPartsOf(users.users[0]).username).toBe(request.username);
  });

  it('should_not_hash_password_when_username_is_taken', async () => {
    await register.execute(registerRequest('ada', 'correct horse'));
    const hash = vi.spyOn(hasher, 'hash');

    const result = await register.execute(registerRequest('ada', 'other password'));

    // The lookup runs before the hash, so a taken username costs no hash work.
    expect(result).toEqual({ ok: false, error: { kind: 'username-taken' } });
    expect(hash).not.toHaveBeenCalled();
    expect(users.users).toHaveLength(1);
  });

  it('should_not_hash_password_when_username_differs_only_in_case', async () => {
    await register.execute(registerRequest('ada', 'correct horse'));
    const hash = vi.spyOn(hasher, 'hash');

    const result = await register.execute(registerRequest('Ada', 'other password'));

    // The lookup ignores letter case, so it finds `ada` before the hash runs.
    expect(result).toEqual({ ok: false, error: { kind: 'username-taken' } });
    expect(hash).not.toHaveBeenCalled();
    expect(users.users).toHaveLength(1);
  });

  it('should_reject_without_storing_user_when_password_hasher_fails', async () => {
    const failure = new Error('scrypt failed');
    vi.spyOn(hasher, 'hash').mockRejectedValue(failure);

    // An unexpected failure is not a RegisterProblem. HttpErrorFilter turns it into a 500.
    await expect(register.execute(registerRequest('ada', 'correct horse'))).rejects.toBe(failure);
    expect(users.users).toHaveLength(0);
  });
});
