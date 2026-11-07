import { err, ok, type Result } from '../../domain/shared/result.js';
import { PASSWORD_LENGTH, passwordLength } from '../../domain/user/password.js';
import { Username } from '../../domain/user/username.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { SessionToken, TokenIssuer } from '../ports/token-issuer.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { Credentials } from './credentials.js';

// One problem for an unknown username and for a wrong password, so the
// answer does not tell which usernames exist.
export type LoginProblem = 'invalid-credentials';

// Input port of sign-in (API-FR-01).
export interface Login {
  execute(request: Credentials): Promise<Result<SessionToken, LoginProblem>>;
}

export const LOGIN = Symbol('Login');

// An unknown username still costs one hash check, as a wrong password does,
// so the answer time does not tell which usernames exist.
const DUMMY_PASSWORD = 'unknown-user-dummy-password';

// Checks the password against the stored hash and issues a SessionToken.
export class LoginUseCase implements Login {
  // The constructor starts the dummy hash, so no sign-in pays for it. A
  // failed hash does not throw here. Each unknown username gets the failure.
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenIssuer,
  ) {
    this.dummyHash = hasher.hash(DUMMY_PASSWORD);
    // This handler stops an unhandled rejection. A later await still sees the failure.
    this.dummyHash.catch(() => undefined);
  }

  async execute(request: Credentials): Promise<Result<SessionToken, LoginProblem>> {
    // No stored password is longer than the maximum. This check bounds the
    // hash work of one request and gives the same failure as a wrong password.
    if (passwordLength(request.password) > PASSWORD_LENGTH.max) {
      return err('invalid-credentials');
    }
    const username = Username.create(request.username);
    const user = username.ok ? await this.users.findByUsername(username.value) : null;
    const hash = user === null ? await this.dummyHash : user.passwordHash.value;
    const matches = await this.hasher.verify(request.password, hash);
    if (user === null || !matches) {
      return err('invalid-credentials');
    }
    return ok(this.tokens.issue(user.id));
  }
}
