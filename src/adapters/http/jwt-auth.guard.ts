import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AUTHENTICATE_TOKEN,
  type AuthenticateToken,
} from '../../application/auth/authenticate-token.use-case.js';
import type { UserId } from '../../domain/user/user-id.js';

// RFC 7235: the scheme name is case-insensitive, so the guard compares it
// in lower case.
const BEARER_PREFIX = 'bearer ';

// A request that passed JwtAuthGuard. The guard sets userId.
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  userId: UserId;
}

// Guards a route with the token of POST /auth/login (API-FR-01). It calls
// the AuthenticateToken input port, as a controller calls its input ports
// (decision 14). A rejected request gets a 401, and HttpErrorFilter answers
// it with ErrorDto (API-FR-06).
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(AUTHENTICATE_TOKEN) private readonly authenticate: AuthenticateToken) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerTokenOf(request.headers.authorization);
    if (token === undefined) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const result = await this.authenticate.execute(token);
    if (!result.ok) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    request.userId = result.value;
    return true;
  }
}

// The token after "Bearer " in any letter case, or undefined when the header
// has no bearer token.
function bearerTokenOf(header: string | string[] | undefined): string | undefined {
  if (
    typeof header !== 'string' ||
    header.slice(0, BEARER_PREFIX.length).toLowerCase() !== BEARER_PREFIX
  ) {
    return undefined;
  }
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : undefined;
}
