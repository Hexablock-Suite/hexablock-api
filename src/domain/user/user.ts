import type { PasswordAttempt } from './password-attempt.js';
import type { PasswordHash } from './password-hash.js';
import type { PasswordVerifier } from './password-verifier.js';
import type { UserId } from './user-id.js';
import type { Username } from './username.js';

// The receiver of the parts of a User. User.deliverTo() calls it once. Only
// the border implements it, for example the repository or the token issuer.
export interface UserReceiver {
  receive(id: UserId, username: Username, passwordHash: PasswordHash): void;
}

// Aggregate root: a player account (API-FR-01, classes.md decision 16). It
// keeps the credentials of one account together and checks a typed password
// against its own hash, so no caller reads the hash. It keeps the password
// hash, never the plain password. The aggregate has no getter and no public
// field: deliverTo() gives its parts to a receiver of the border. The value
// objects guard their own rules, so the factories check nothing more.
export class User {
  private constructor(
    private readonly id: UserId,
    private readonly username: Username,
    private readonly passwordHash: PasswordHash,
  ) {}

  // Creates a new user. Sign-up calls it with a new id and the hash of the password.
  static register(id: UserId, username: Username, passwordHash: PasswordHash): User {
    return new User(id, username, passwordHash);
  }

  // Rebuilds a stored user from the values that it delivered.
  static restore(id: UserId, username: Username, passwordHash: PasswordHash): User {
    return new User(id, username, passwordHash);
  }

  // Two users are the same user when they have the same id. The other data does not count.
  equals(other: User): boolean {
    return this.id.equals(other.id);
  }

  // Delivers the parts to a receiver of the border in one call. No operation
  // returns them. The values are immutable, so the receiver cannot change
  // the user through them.
  deliverTo(receiver: UserReceiver): void {
    receiver.receive(this.id, this.username, this.passwordHash);
  }

  // Tells if a typed attempt is the password of this user. The user passes
  // its own hash to the verifier, so the caller reads no hash. The domain
  // knows no hash algorithm: the verifier does the check.
  passwordMatches(attempt: PasswordAttempt, verifier: PasswordVerifier): Promise<boolean> {
    return verifier.verify(attempt, this.passwordHash);
  }
}
