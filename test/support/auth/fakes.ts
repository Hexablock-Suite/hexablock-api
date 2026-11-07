import type { PasswordHasher } from '../../../src/application/ports/password-hasher.js';
import type { SessionToken, TokenIssuer } from '../../../src/application/ports/token-issuer.js';
import type { UserIdGenerator } from '../../../src/application/ports/user-id-generator.js';
import type { UserRepository } from '../../../src/application/ports/user-repository.js';
import { err, ok, type Result } from '../../../src/domain/shared/result.js';
import type { User } from '../../../src/domain/user/user.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import type { Username } from '../../../src/domain/user/username.js';
import { testUserId } from '../user-ids.js';

// Test doubles for the account ports. Each one is plain and predictable,
// so a use case test can read the stored state.

export class InMemoryUserRepository implements UserRepository {
  readonly users: User[] = [];

  async findByUsername(username: Username): Promise<User | null> {
    return this.users.find((user) => user.username.value === username.value) ?? null;
  }

  // Ignores letter case, as the unique index on lower(username) does.
  async isUsernameTaken(username: Username): Promise<boolean> {
    const name = username.value.toLowerCase();
    return this.users.some((user) => user.username.value.toLowerCase() === name);
  }

  async add(user: User): Promise<Result<void, 'username-taken'>> {
    if (await this.isUsernameTaken(user.username)) {
      return err('username-taken');
    }
    this.users.push(user);
    return ok(undefined);
  }
}

// The hash is the plain password with a prefix. Tests can see that the
// use case stores the hasher output, not the plain password.
export class PrefixPasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plain}`;
  }
}

const TOKEN_PREFIX = 'token-for:';

export class PrefixTokenIssuer implements TokenIssuer {
  issue(userId: UserId): SessionToken {
    return `${TOKEN_PREFIX}${userId.value}`;
  }

  // Like JwtTokenIssuer, it returns null for a subject that is not a UUID.
  verify(token: SessionToken): UserId | null {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    try {
      return UserId.from(token.slice(TOKEN_PREFIX.length));
    } catch {
      return null;
    }
  }
}

// Gives testUserId(1), testUserId(2) and so on.
export class SequenceUserIdGenerator implements UserIdGenerator {
  private count = 0;

  next(): UserId {
    this.count += 1;
    return UserId.from(testUserId(this.count));
  }
}
