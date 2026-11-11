import { LoginUseCase } from '../../../src/application/auth/login.use-case.js';
import { RegisterUseCase } from '../../../src/application/auth/register.use-case.js';
import type { PasswordHasher } from '../../../src/application/ports/password-hasher.js';
import { Password } from '../../../src/domain/user/password.js';
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import {
  InMemoryUserRepository,
  PrefixPasswordHasher,
  PrefixTokenIssuer,
  SequenceUserIdGenerator,
} from '../../support/auth/fakes.js';
import { testUserId } from '../../support/user-ids.js';

// One code point, two UTF-16 units.
const EMOJI = '\u{1F600}';

describe('LoginUseCase', () => {
  let login: LoginUseCase;
  let users: InMemoryUserRepository;
  let hasher: PrefixPasswordHasher;
  let tokens: PrefixTokenIssuer;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    hasher = new PrefixPasswordHasher();
    tokens = new PrefixTokenIssuer();
    await new RegisterUseCase(users, hasher, new SequenceUserIdGenerator()).execute({
      username: 'ada',
      password: 'correct horse',
    });
    login = new LoginUseCase(users, hasher, tokens);
  });

  it('should_return_token_for_user_when_credentials_are_valid', async () => {
    const result = await login.execute({ username: 'ada', password: 'correct horse' });

    expect(result).toEqual({ ok: true, value: `token-for:${testUserId(1)}` });
  });

  it('should_fail_with_invalid_credentials_when_password_is_wrong', async () => {
    const result = await login.execute({ username: 'ada', password: 'wrong horse' });

    expect(result).toEqual({ ok: false, error: 'invalid-credentials' });
  });

  it('should_fail_with_invalid_credentials_when_username_is_unknown', async () => {
    const result = await login.execute({ username: 'grace', password: 'correct horse' });

    expect(result).toEqual({ ok: false, error: 'invalid-credentials' });
  });

  // Login finds the user by the name as typed (#62).
  it('should_fail_with_invalid_credentials_when_username_differs_only_in_case', async () => {
    const result = await login.execute({ username: 'ADA', password: 'correct horse' });

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
    expect(verify).toHaveBeenCalledWith(
      'correct horse',
      PasswordHash.from('hashed:unknown-user-dummy-password'),
    );
  });

  // The typed text can be shorter than any Password. The unknown username
  // still costs one check, against the hash that the constructor started.
  it('should_verify_the_short_typed_text_once_against_the_started_dummy_hash_when_username_is_unknown', async () => {
    const hash = vi.spyOn(hasher, 'hash');
    const built = new LoginUseCase(new InMemoryUserRepository(), hasher, new PrefixTokenIssuer());
    const dummy: unknown = await hash.mock.results[0].value;
    const verify = vi.spyOn(hasher, 'verify');

    const result = await built.execute({ username: 'nobody', password: 'short' });

    expect(result).toEqual({ ok: false, error: 'invalid-credentials' });
    expect(verify).toHaveBeenCalledOnce();
    expect(verify.mock.calls[0][0]).toBe('short');
    expect(verify.mock.calls[0][1]).toBe(dummy);
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

  // The maximum bounds the hash work of one request (#60).
  it('should_fail_with_invalid_credentials_without_hashing_when_password_has_more_than_128_characters', async () => {
    const verify = vi.spyOn(hasher, 'verify');
    const hash = vi.spyOn(hasher, 'hash');

    for (const password of ['x'.repeat(129), EMOJI.repeat(129)]) {
      const result = await login.execute({ username: 'ada', password });

      expect(result).toEqual({ ok: false, error: 'invalid-credentials' });
    }
    expect(verify).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });

  it('should_verify_password_when_it_has_128_code_points', async () => {
    const verify = vi.spyOn(hasher, 'verify');

    for (const password of ['x'.repeat(128), EMOJI.repeat(128)]) {
      await login.execute({ username: 'ada', password });
    }

    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('should_verify_password_once_when_password_is_wrong', async () => {
    const verify = vi.spyOn(hasher, 'verify');

    await login.execute({ username: 'ada', password: 'wrong horse' });

    expect(verify).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith('wrong horse', PasswordHash.from('hashed:correct horse'));
  });

  // #90: the port carries domain types, so the use case reads no text.
  it('should_pass_the_typed_text_and_the_stored_password_hash_to_the_hasher_when_user_signs_in', async () => {
    const verify = vi.spyOn(hasher, 'verify');

    await login.execute({ username: 'ada', password: 'correct horse' });

    const [typed, hash] = verify.mock.calls[0];
    expect(typed).toBe('correct horse');
    expect(hash).toBeInstanceOf(PasswordHash);
  });

  it('should_hash_the_dummy_password_as_a_password_when_the_use_case_is_built', () => {
    const hash = vi.spyOn(hasher, 'hash');

    void new LoginUseCase(new InMemoryUserRepository(), hasher, new PrefixTokenIssuer());

    expect(hash).toHaveBeenCalledOnce();
    expect(hash.mock.calls[0][0]).toBeInstanceOf(Password);
  });

  // The trap of #90: a wrong password can be shorter than any Password, and
  // it still costs one hash check. So verify() takes the typed text.
  it('should_verify_the_typed_text_once_when_it_is_shorter_than_any_password', async () => {
    const verify = vi.spyOn(hasher, 'verify');

    const result = await login.execute({ username: 'ada', password: 'short' });

    expect(result).toEqual({ ok: false, error: 'invalid-credentials' });
    expect(verify).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith('short', PasswordHash.from('hashed:correct horse'));
  });

  // #91: the use case never opens the user. The user checks the typed text
  // with the hasher, and the token issuer takes the user.
  it('should_ask_the_found_user_to_check_the_typed_text_with_the_hasher_when_user_signs_in', async () => {
    const [ada] = users.users;
    const passwordMatches = vi.spyOn(ada, 'passwordMatches');

    await login.execute({ username: 'ada', password: 'wrong horse' });

    expect(passwordMatches).toHaveBeenCalledOnce();
    expect(passwordMatches.mock.calls[0][0]).toBe('wrong horse');
    expect(passwordMatches.mock.calls[0][1]).toBe(hasher);
  });

  it('should_pass_the_found_user_to_the_token_issuer_when_credentials_are_valid', async () => {
    const issue = vi.spyOn(tokens, 'issue');

    const result = await login.execute({ username: 'ada', password: 'correct horse' });

    expect(result).toEqual({ ok: true, value: `token-for:${testUserId(1)}` });
    expect(issue).toHaveBeenCalledOnce();
    expect(issue.mock.calls[0][0]).toBe(users.users[0]);
  });

  it('should_verify_password_once_when_credentials_are_valid', async () => {
    const verify = vi.spyOn(hasher, 'verify');

    const result = await login.execute({ username: 'ada', password: 'correct horse' });

    expect(result).toEqual({ ok: true, value: `token-for:${testUserId(1)}` });
    expect(verify).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith('correct horse', PasswordHash.from('hashed:correct horse'));
  });

  it('should_issue_no_token_when_the_password_is_wrong_or_the_username_is_unknown', async () => {
    const issue = vi.spyOn(tokens, 'issue');

    await login.execute({ username: 'ada', password: 'wrong horse' });
    await login.execute({ username: 'grace', password: 'correct horse' });

    expect(issue).not.toHaveBeenCalled();
  });
});
