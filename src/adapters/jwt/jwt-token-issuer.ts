import type { JwtService } from '@nestjs/jwt';
import { receiveUserOf } from '../received.js';
import type { SessionToken } from '../../application/auth/session-token.js';
import type { TokenIssuer } from '../../application/ports/token-issuer.js';
import type { User } from '../../domain/user/user.js';
import { UserId } from '../../domain/shared/user-id.js';

// Adapter of the TokenIssuer port with @nestjs/jwt. It gets a configured
// JwtService through its constructor and reads no configuration itself.
// AppModule builds that service from the configuration. issue() receives the
// parts that the user delivers and signs the text of its id as the subject.
export class JwtTokenIssuer implements TokenIssuer {
  constructor(private readonly jwt: JwtService) {}

  issue(user: User): SessionToken {
    return this.jwt.sign({ sub: receiveUserOf(user).id });
  }

  verify(token: SessionToken): UserId | null {
    try {
      const { sub } = this.jwt.verify<{ sub?: unknown }>(token);
      // A sub that is not a UUID gives a failed UserId, so the answer is null.
      const userId = typeof sub === 'string' ? UserId.from(sub) : null;
      return userId?.ok === true ? userId.value : null;
    } catch {
      // A bad signature, an expired token or a malformed token.
      return null;
    }
  }
}
