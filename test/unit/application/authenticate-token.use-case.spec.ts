import { AuthenticateTokenUseCase } from '../../../src/application/auth/authenticate-token.use-case.js';
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import { User } from '../../../src/domain/user/user.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { Username } from '../../../src/domain/user/username.js';
import { InMemoryUserRepository, PrefixTokenIssuer } from '../../support/auth/fakes.js';
import { testUserId } from '../../support/user-ids.js';
import { valueOf } from '../../support/result.js';

describe('AuthenticateTokenUseCase', () => {
  let authenticate: AuthenticateTokenUseCase;

  // The store holds one user: testUserId(1).
  beforeEach(() => {
    const users = new InMemoryUserRepository();
    users.users.push(
      User.register(
        valueOf(UserId.from(testUserId(1))),
        valueOf(Username.create('ada')),
        valueOf(PasswordHash.from('scrypt$hash')),
      ),
    );
    authenticate = new AuthenticateTokenUseCase(new PrefixTokenIssuer(), users);
  });

  it('should_return_user_id_when_token_is_valid_and_its_user_is_stored', async () => {
    const result = await authenticate.execute(`token-for:${testUserId(1)}`);

    expect(result).toEqual({ ok: true, value: valueOf(UserId.from(testUserId(1))) });
  });

  it('should_fail_with_invalid_token_when_token_issuer_rejects_token', async () => {
    const result = await authenticate.execute('forged-token');

    expect(result).toEqual({ ok: false, error: { kind: 'invalid-token' } });
  });

  // A valid token whose user has no stored row gets the same problem as a
  // forged one, so the answer does not tell which check failed (#137).
  it('should_fail_with_invalid_token_when_the_user_of_a_valid_token_is_not_stored', async () => {
    const result = await authenticate.execute(`token-for:${testUserId(2)}`);

    expect(result).toEqual({ ok: false, error: { kind: 'invalid-token' } });
  });
});
