import { err, ok, type Result } from '../../domain/shared/result.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { SessionToken, TokenIssuer } from '../ports/token-issuer.js';

// One problem for a malformed, expired or forged token, so the answer does
// not tell which check failed.
export type TokenProblem = 'invalid-token';

// Input port of the token check (API-FR-01). JwtAuthGuard calls it and never
// calls TokenIssuer (decision 14 of docs/architecture/classes.md).
export interface AuthenticateToken {
  execute(token: SessionToken): Promise<Result<UserId, TokenProblem>>;
}

export const AUTHENTICATE_TOKEN = Symbol('AuthenticateToken');

// Reads the UserId of a SessionToken through the TokenIssuer port.
export class AuthenticateTokenUseCase implements AuthenticateToken {
  constructor(private readonly tokens: TokenIssuer) {}

  async execute(token: SessionToken): Promise<Result<UserId, TokenProblem>> {
    const userId = this.tokens.verify(token);
    return userId === null ? err('invalid-token') : ok(userId);
  }
}
