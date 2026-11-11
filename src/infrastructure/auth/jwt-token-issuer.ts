import type { JwtService } from '@nestjs/jwt';
import { receiveValueOf } from '../../adapters/received.js';
import type { SessionToken, TokenIssuer } from '../../application/ports/token-issuer.js';
import type { User } from '../../domain/user/user.js';
import { UserId } from '../../domain/user/user-id.js';

// Adapter of the TokenIssuer port with @nestjs/jwt. It gets a configured
// JwtService through its constructor and reads no configuration itself.
// AppModule builds that service from the configuration. issue() reads the id
// from the snapshot of the user and receives its text for the subject.
export class JwtTokenIssuer implements TokenIssuer {
  constructor(private readonly jwt: JwtService) {}

  issue(user: User): SessionToken {
    return this.jwt.sign({ sub: receiveValueOf(user.snapshot().id) });
  }

  verify(token: SessionToken): UserId | null {
    try {
      const { sub } = this.jwt.verify<{ sub?: unknown }>(token);
      return typeof sub === 'string' && sub.length > 0 ? UserId.from(sub) : null;
    } catch {
      // A bad signature, an expired token, a malformed token or a sub that
      // is not a UUID (UserId.from throws for it).
      return null;
    }
  }
}
