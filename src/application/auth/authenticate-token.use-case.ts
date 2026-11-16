import { err, ok, type Result } from '../../domain/shared/result.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { SessionToken, TokenIssuer } from '../ports/token-issuer.js';
import type { UseCase } from '../use-case.js';

// One problem for a malformed, expired or forged token, so the answer does
// not tell which check failed. It carries a kind, so LoggingAspect logs it
// and no token.
export type TokenProblem = { readonly kind: 'invalid-token' };

// Input port of the token check (API-FR-01). JwtAuthGuard calls it and never
// calls TokenIssuer (decision 14 of docs/architecture/classes.md). It binds
// UseCase, so one aspect can wrap it (decision 7).
export type AuthenticateToken = UseCase<SessionToken, Result<UserId, TokenProblem>>;

export const AUTHENTICATE_TOKEN = Symbol('AuthenticateToken');

// Reads the UserId of a SessionToken through the TokenIssuer port.
export class AuthenticateTokenUseCase implements AuthenticateToken {
  constructor(private readonly tokens: TokenIssuer) {}

  async execute(token: SessionToken): Promise<Result<UserId, TokenProblem>> {
    const userId = this.tokens.verify(token);
    return userId === null ? err({ kind: 'invalid-token' }) : ok(userId);
  }
}
