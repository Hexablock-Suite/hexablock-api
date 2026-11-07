import type { JwtService } from '@nestjs/jwt';
import type { SessionToken, TokenIssuer } from '../../application/ports/token-issuer.js';
import { UserId } from '../../domain/user/user-id.js';

// Adapter of the TokenIssuer port with @nestjs/jwt. It gets a configured
// JwtService through its constructor and reads no configuration itself.
// AppModule builds that service from the configuration.
export class JwtTokenIssuer implements TokenIssuer {
  constructor(private readonly jwt: JwtService) {}

  issue(userId: UserId): SessionToken {
    return this.jwt.sign({ sub: userId.value });
  }

  verify(token: SessionToken): UserId | null {
    try {
      const { sub } = this.jwt.verify<{ sub?: unknown }>(token);
      return typeof sub === 'string' && sub.length > 0 ? UserId.from(sub) : null;
    } catch {
      // A bad signature, an expired token or a malformed token.
      return null;
    }
  }
}
