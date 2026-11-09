import type { PasswordHash } from './password-hash.js';
import type { UserId } from './user-id.js';
import type { Username } from './username.js';

// A player account (API-FR-01). It keeps the password hash, never the
// plain password.
export class User {
  constructor(
    readonly id: UserId,
    readonly username: Username,
    readonly passwordHash: PasswordHash,
  ) {}

  // Two users are the same user when they have the same id. The other data does not count.
  equals(other: User): boolean {
    return this.id.equals(other.id);
  }
}
