import { LoginUseCase } from '../../../src/application/auth/login.use-case.js';
import { RegisterUseCase } from '../../../src/application/auth/register.use-case.js';
import type { PasswordHasher } from '../../../src/application/ports/password-hasher.js';
import {
  InMemoryUserRepository,
  PrefixPasswordHasher,
  PrefixTokenIssuer,
  SequenceUserIdGenerator,
} from '../../support/auth/fakes.js';

describe('LoginUseCase', () => {
  let login: LoginUseCase;
  let hasher: PrefixPasswordHasher;

  beforeEach(async () => {
    const users = new InMemoryUserRepository();
    hasher = new PrefixPasswordHasher();
    await new RegisterUseCase(users, hasher, new SequenceUserIdGenerator()).execute({
      username: 'ada',
      password: 'correct horse',
    });
    login = new LoginUseCase(users, hasher, new PrefixTokenIssuer());
  });

  it('should_return_token_for_user_when_credentials_are_valid', async () => {
    const result = await login.execute({ username: 'ada', password: 'correct horse' });

    expect(result).toEqual({ ok: true, value: 'token-for:user-1' });
  });

  it('should_fail_with_invalid_credentials_when_password_is_wrong', async () => {
    const result = await login.execute({ username: 'ada', password: 'wrong horse' });

    expect(result).toEqual({ ok: false, error: 'invalid-credentials' });
  });

  it('should_fail_with_invalid_credentials_when_username_is_unknown', async () => {
    const result = await login.execute({ username: 'grace', password: 'correct horse' });

    expect(result).toEqual({ ok: false, error: 'invalid-credentials' });
  });

  it('should_fail_with_invalid_credentials_when_username_breaks_the_rules', async () => {
    const result = await login.execute({ username: 'a!', password: 'correct horse' });

    expect(result).toEqual({ ok: false, error: 'invalid-credentials' });
  });

  it('should_verify_password_once_against_dummy_hash_when_username_is_unknown', async () => {
    const verify = vi.spyOn(hasher, 'verify');

    const result = await login.execute({ username: 'grace', password: 'correct horse' });

    expect(result).toEqual({ ok: false, error: 'invalid-credentials' });
    expect(verify).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith('correct horse', 'hashed:unknown-user-dummy-password');
  });

  it('should_not_hash_during_login_when_first_unknown_username_signs_in', async () => {
    const hash = vi.spyOn(hasher, 'hash');
    const result = await login.execute({ username: 'grace', password: 'correct horse' });
    // An unknown username costs one hash check, as a wrong password does.
    expect(result).toEqual({ ok: false, error: 'invalid-credentials' });
    expect(hash).not.toHaveBeenCalled();
  });

  // The constructor starts the dummy hash. Its failure is not an unhandled
  // rejection, and the first unknown username still gets the failure.
  it('should_reject_unknown_username_login_with_hash_failure_when_dummy_hash_fails_early', async () => {
    const failure = new Error('hasher is down');
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    // A vi.fn spy handles the promises it returns, so this hasher is a plain object.
    const failingHasher: PasswordHasher = {
      hash: () => Promise.reject(failure),
      verify: () => Promise.resolve(false),
    };
    process.on('unhandledRejection', record);
    try {
      const early = new LoginUseCase(
        new InMemoryUserRepository(),
        failingHasher,
        new PrefixTokenIssuer(),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).toEqual([]);
      await expect(early.execute({ username: 'grace', password: 'correct horse' })).rejects.toBe(
        failure,
      );
    } finally {
      process.off('unhandledRejection', record);
    }
  });

  it('should_verify_password_once_when_password_is_wrong', async () => {
    const verify = vi.spyOn(hasher, 'verify');

    await login.execute({ username: 'ada', password: 'wrong horse' });

    expect(verify).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith('wrong horse', 'hashed:correct horse');
  });
});
