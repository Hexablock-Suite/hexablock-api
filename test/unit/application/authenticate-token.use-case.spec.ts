import { AuthenticateTokenUseCase } from '../../../src/application/auth/authenticate-token.use-case.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { PrefixTokenIssuer } from '../../support/auth/fakes.js';
import { testUserId } from '../../support/user-ids.js';

describe('AuthenticateTokenUseCase', () => {
  const authenticate = new AuthenticateTokenUseCase(new PrefixTokenIssuer());

  it('should_return_user_id_when_token_is_valid', async () => {
    const result = await authenticate.execute(`token-for:${testUserId(1)}`);

    expect(result).toEqual({ ok: true, value: UserId.from(testUserId(1)) });
  });

  it('should_fail_with_invalid_token_when_token_issuer_rejects_token', async () => {
    const result = await authenticate.execute('forged-token');

    expect(result).toEqual({ ok: false, error: 'invalid-token' });
  });
});
