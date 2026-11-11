import type { PasswordHash } from './password-hash.js';
import type { PasswordVerifier } from './password-verifier.js';
import type { UserId } from './user-id.js';
import type { Username } from './username.js';

// The state of one user, as domain values. User.snapshot() gives it, and
// User.restore() builds the aggregate again from it. It is the Memento of
// the aggregate (Millett and Tune): a mapper reads it and maps it to a row.
// It has no rule and no behavior.
export interface UserState {
  readonly id: UserId;
  readonly username: Username;
  readonly passwordHash: PasswordHash;
}

// Aggregate root: a player account (API-FR-01, classes.md decision 16). It
// has its own repository, which sign-up and sign-in use. It keeps the
// password hash, never the plain password. The aggregate has no getter and
// no public field: snapshot() gives a copy of its state. The value objects
// guard their own rules, so the factories check nothing more.
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

  // Rebuilds a stored user from its state.
  static restore(state: UserState): User {
    return new User(state.id, state.username, state.passwordHash);
  }

  // Two users are the same user when they have the same id. The other data does not count.
  equals(other: User): boolean {
    return this.id.equals(other.id);
  }

  // Gives a copy of the state. A change to the copy does not change the
  // aggregate: the object is new, and the values are immutable.
  snapshot(): UserState {
    return { id: this.id, username: this.username, passwordHash: this.passwordHash };
  }

  // Tells if a typed text is the password of this user. The user passes its
  // own hash to the verifier, so the caller reads no hash. The domain knows
  // no hash algorithm: the verifier does the check.
  passwordMatches(typed: string, verifier: PasswordVerifier): Promise<boolean> {
    return verifier.verify(typed, this.passwordHash);
  }
}
