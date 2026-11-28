import { UserMother } from '../../support/object-mother/user-mother.js';
import { AuthenticateTokenTestApi } from '../../support/testing-api/authenticate-token.test-api.js';

describe('AuthenticateTokenUseCase', () => {
  let authenticate: AuthenticateTokenTestApi;

  // The store holds one user: user 1, ada.
  beforeEach(() => {
    authenticate = new AuthenticateTokenTestApi().givenAStoredUser(UserMother.ada());
  });

  it('should_return_user_id_when_token_is_valid_and_its_user_is_stored', async () => {
    await authenticate.whenAuthenticatingTheTokenOfUser(1);

    authenticate.thenTheTokenNamesUser(1);
  });

  it('should_fail_with_invalid_token_when_token_issuer_rejects_token', async () => {
    await authenticate.whenAuthenticating('forged-token');

    authenticate.thenTheTokenIsInvalid();
  });

  // A valid token whose user has no stored row gets the same problem as a
  // forged one, so the answer does not tell which check failed (#137).
  it('should_fail_with_invalid_token_when_the_user_of_a_valid_token_is_not_stored', async () => {
    await authenticate.whenAuthenticatingTheTokenOfUser(2);

    authenticate.thenTheTokenIsInvalid();
  });
});
