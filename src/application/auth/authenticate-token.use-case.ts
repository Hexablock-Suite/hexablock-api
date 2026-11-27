import { err, ok, type Result } from '../../domain/shared/result.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { TokenIssuer } from '../ports/token-issuer.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { UseCase } from '../use-case.js';
import type { SessionToken } from './session-token.js';

// One problem for a malformed, expired or forged token, and for a valid
// token whose user is not stored, so the answer does not tell which check
// failed. It carries a kind, so LoggingAspect logs it
// and no token.
export type TokenProblem = { readonly kind: 'invalid-token' };

// Input port of the token check (API-FR-01). JwtAuthGuard calls it and never
// calls TokenIssuer (decision 14 of docs/architecture/classes.md). It binds
// UseCase, so one aspect can wrap it (decision 7).
export type AuthenticateToken = UseCase<SessionToken, Result<UserId, TokenProblem>>;

export const AUTHENTICATE_TOKEN = Symbol('AuthenticateToken');

// Reads the UserId of a SessionToken through the TokenIssuer port. Then it
// asks the UserRepository port if that user is still stored. A token of a
// deleted user is a bad token: every guarded route answers 401 (#137,
// decision of 2026-11-17). The check costs one query per guarded request.
export class AuthenticateTokenUseCase implements AuthenticateToken {
  constructor(
    private readonly tokens: TokenIssuer,
    private readonly users: UserRepository,
  ) {}

  async execute(token: SessionToken): Promise<Result<UserId, TokenProblem>> {
    const userId = this.tokens.verify(token);
    if (userId === null || !(await this.users.exists(userId))) {
      return err({ kind: 'invalid-token' });
    }
    return ok(userId);
  }
}
