import { err, ok, type Result } from '../../domain/shared/result.js';
import { Password } from '../../domain/user/password.js';
import type { PasswordHash } from '../../domain/user/password-hash.js';
import type { User } from '../../domain/user/user.js';
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

// The PasswordHasher port takes a Password, so the dummy text becomes one.
function dummyPassword(): Password {
  const dummy = Password.create(DUMMY_PASSWORD);
  if (!dummy.ok) {
    throw new Error('The dummy password must follow the password rule.');
  }
  return dummy.value;
}

// Asks the user to check the password and issues a SessionToken. It reads
// no field and no snapshot of the user.
export class LoginUseCase implements Login {
  // The constructor starts the dummy hash, so no sign-in pays for it. A
  // failed hash does not throw here. Each unknown username gets the failure.
  private readonly dummyHash: Promise<PasswordHash>;

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenIssuer,
  ) {
    this.dummyHash = hasher.hash(dummyPassword());
    // This handler stops an unhandled rejection. A later await still sees the failure.
    this.dummyHash.catch(() => undefined);
  }

  async execute(request: Credentials): Promise<Result<SessionToken, LoginProblem>> {
    // No stored password is longer than the maximum. This check bounds the
    // hash work of one request and gives the same failure as a wrong password.
    if (Password.isTooLong(request.password)) {
      return err('invalid-credentials');
    }
    const username = Username.create(request.username);
    const user = username.ok ? await this.users.findByUsername(username.value) : null;
    // The check runs before the test of the user, so an unknown username costs it too.
    const matches = await this.passwordMatches(user, request.password);
    if (user === null || !matches) {
      return err('invalid-credentials');
    }
    return ok(this.tokens.issue(user));
  }

  // Runs exactly one hash check. The typed text is not a Password: a wrong
  // password can be shorter than any Password, and it still costs one check.
  // A found user checks the text against its own hash. An unknown username
  // costs the same check, against the dummy hash, and never matches.
  private async passwordMatches(user: User | null, typed: string): Promise<boolean> {
    if (user !== null) {
      return user.passwordMatches(typed, this.hasher);
    }
    await this.hasher.verify(typed, await this.dummyHash);
    return false;
  }
}
