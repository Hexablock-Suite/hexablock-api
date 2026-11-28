import {
  type AuthenticateToken,
  AuthenticateTokenUseCase,
  type TokenProblem,
} from '../../../src/application/auth/authenticate-token.use-case.js';
import type { Result } from '../../../src/domain/shared/result.js';
import type { User } from '../../../src/domain/user/user.js';
import type { UserId } from '../../../src/domain/user/user-id.js';
import { InMemoryUserRepository, PrefixTokenIssuer } from '../auth/fakes.js';
import { UserMother } from '../object-mother/user-mother.js';
import { testUserId } from '../user-ids.js';
import { WhenOutcome } from './when-outcome.js';

// Testing API of AuthenticateTokenUseCase (API-FR-01). It builds the use case
// and its test doubles, and the doubles stay private: a test names no
// double. A then step fails when no when step ran.
export class AuthenticateTokenTestApi {
  private readonly users = new InMemoryUserRepository();
  private readonly authenticate: AuthenticateToken = new AuthenticateTokenUseCase(
    new PrefixTokenIssuer(),
    this.users,
  );
  private readonly outcome = new WhenOutcome<Result<UserId, TokenProblem>>();

  givenAStoredUser(user: User): this {
    this.users.users.push(user);
    return this;
  }

  // Sends a valid token of user n, as the token issuer signs it.
  async whenAuthenticatingTheTokenOfUser(n: number): Promise<this> {
    return this.whenAuthenticating(`token-for:${testUserId(n)}`);
  }

  async whenAuthenticating(token: string): Promise<this> {
    await this.outcome.record(() => this.authenticate.execute(token));
    return this;
  }

  thenTheTokenNamesUser(n: number): void {
    expect(this.outcome.value()).toEqual({ ok: true, value: UserMother.id(n) });
  }

  thenTheTokenIsInvalid(): void {
    expect(this.outcome.value()).toEqual({ ok: false, error: { kind: 'invalid-token' } });
  }
}
