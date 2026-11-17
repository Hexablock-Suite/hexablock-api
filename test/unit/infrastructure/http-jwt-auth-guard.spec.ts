import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../src/adapters/http/jwt-auth.guard.js';
import { AuthenticateTokenUseCase } from '../../../src/application/auth/authenticate-token.use-case.js';
import { InMemoryUserRepository, PrefixTokenIssuer } from '../../support/auth/fakes.js';

// API-FR-01: JwtAuthGuard reads the token after "Bearer ". An HTTP server
// trims the whitespace at the end of a header value, so these cases do not
// reach the guard over HTTP. The tests call the guard directly.
function httpContext(request: object): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it.each(['Bearer ', 'Bearer    ', 'Bearer \t '])(
    'should_reject_as_missing_token_when_bearer_is_followed_only_by_whitespace',
    async (authorization) => {
      const authenticate = new AuthenticateTokenUseCase(
        new PrefixTokenIssuer(),
        new InMemoryUserRepository(),
      );
      const execute = vi.spyOn(authenticate, 'execute');
      const guard = new JwtAuthGuard(authenticate);
      const request = { headers: { authorization } };

      const allowed = guard.canActivate(httpContext(request));

      await expect(allowed).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(allowed).rejects.toThrow('Missing bearer token');
      expect(request).not.toHaveProperty('userId');
      expect(execute).not.toHaveBeenCalled();
    },
  );
});
