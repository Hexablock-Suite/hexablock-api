import { receiveValueOf } from '../../../src/adapters/received.js';
import type { PasswordHasher } from '../../../src/application/ports/password-hasher.js';
import type { SessionToken, TokenIssuer } from '../../../src/application/ports/token-issuer.js';
import type { UserIdGenerator } from '../../../src/application/ports/user-id-generator.js';
import type { UserRepository } from '../../../src/application/ports/user-repository.js';
import { err, ok, type Result } from '../../../src/domain/shared/result.js';
import type { Password } from '../../../src/domain/user/password.js';
import type { PasswordAttempt } from '../../../src/domain/user/password-attempt.js';
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import type { User } from '../../../src/domain/user/user.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import type { Username } from '../../../src/domain/user/username.js';
import { userPartsOf } from '../recording-receiver.js';
import { testUserId } from '../user-ids.js';
import { valueOf } from '../result.js';

// Test doubles for the account ports. Each one is plain and predictable,
// so a use case test can read the stored state. A double is border code, as
// an adapter is: it receives the parts that a User delivers.

export class InMemoryUserRepository implements UserRepository {
  readonly users: User[] = [];

  async findByUsername(username: Username): Promise<User | null> {
    return this.users.find((user) => userPartsOf(user).username.equals(username)) ?? null;
  }

  // Asks the rule by its business name (#100). The UserRepository contract
  // checks that the Drizzle adapter gives the same answer.
  async isUsernameTaken(username: Username): Promise<boolean> {
    return this.users.some((user) => userPartsOf(user).username.collidesWith(username));
  }

  async add(user: User): Promise<Result<void, 'username-taken'>> {
    if (await this.isUsernameTaken(userPartsOf(user).username)) {
      return err('username-taken');
    }
    this.users.push(user);
    return ok(undefined);
  }
}

// The hash is the plain password with a prefix. Tests can see that the
// use case stores the hasher output, not the plain password. As the scrypt
// adapter does, this double receives the text of the Password and of the
// PasswordAttempt.
export class PrefixPasswordHasher implements PasswordHasher {
  async hash(password: Password): Promise<PasswordHash> {
    return valueOf(PasswordHash.from(`hashed:${receiveValueOf(password)}`));
  }

  async verify(attempt: PasswordAttempt, hash: PasswordHash): Promise<boolean> {
    return hash.equals(valueOf(PasswordHash.from(`hashed:${receiveValueOf(attempt)}`)));
  }
}

const TOKEN_PREFIX = 'token-for:';

export class PrefixTokenIssuer implements TokenIssuer {
  issue(user: User): SessionToken {
    return `${TOKEN_PREFIX}${receiveValueOf(userPartsOf(user).id)}`;
  }

  // Like JwtTokenIssuer, it returns null for a subject that is not a UUID.
  verify(token: SessionToken): UserId | null {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    try {
      return valueOf(UserId.from(token.slice(TOKEN_PREFIX.length)));
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
    return valueOf(UserId.from(testUserId(this.count)));
  }
}
