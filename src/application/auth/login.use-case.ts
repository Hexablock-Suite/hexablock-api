import { err, ok, type Result } from '../../domain/shared/result.js';
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
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenIssuer,
  ) {}

  async execute(request: Credentials): Promise<Result<SessionToken, LoginProblem>> {
    const username = Username.create(request.username);
    const user = username.ok ? await this.users.findByUsername(username.value) : null;
    const hash = user === null ? await this.dummy() : user.passwordHash.value;
    const matches = await this.hasher.verify(request.password, hash);
    if (user === null || !matches) {
      return err('invalid-credentials');
    }
    return ok(this.tokens.issue(user.id));
  }

  // The dummy hash is made once, on the first unknown username.
  private dummy(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(DUMMY_PASSWORD);
    return this.dummyHash;
  }
}
