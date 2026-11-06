import type { PasswordHasher } from '../../../src/application/ports/password-hasher.js';
import type { SessionToken, TokenIssuer } from '../../../src/application/ports/token-issuer.js';
import type { UserIdGenerator } from '../../../src/application/ports/user-id-generator.js';
import type { UserRepository } from '../../../src/application/ports/user-repository.js';
import { err, ok, type Result } from '../../../src/domain/shared/result.js';
import type { User } from '../../../src/domain/user/user.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import type { Username } from '../../../src/domain/user/username.js';

// Test doubles for the account ports. Each one is plain and predictable,
// so a use case test can read the stored state.

export class InMemoryUserRepository implements UserRepository {
  readonly users: User[] = [];

  async findByUsername(username: Username): Promise<User | null> {
    return this.users.find((user) => user.username.value === username.value) ?? null;
  }

  async add(user: User): Promise<Result<void, 'username-taken'>> {
    if (this.users.some((stored) => stored.username.value === user.username.value)) {
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

  verify(token: SessionToken): UserId | null {
    return token.startsWith(TOKEN_PREFIX) ? UserId.from(token.slice(TOKEN_PREFIX.length)) : null;
  }
}

// Gives user-1, user-2 and so on.
export class SequenceUserIdGenerator implements UserIdGenerator {
  private count = 0;

  next(): UserId {
    this.count += 1;
    return UserId.from(`user-${this.count}`);
  }
}
