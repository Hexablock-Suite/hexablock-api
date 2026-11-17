import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  AUTHORIZE_LEVEL_EDITOR,
  type AuthorizeLevelEditor,
} from '../../application/levels/authorize-level-editor.use-case.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

// Guards the level update (#145). It runs after JwtAuthGuard, which sets
// userId. It calls the AuthorizeLevelEditor input port, as JwtAuthGuard calls
// AuthenticateToken (decision 14). An account outside the list gets a 403,
// and HttpErrorFilter answers it with ErrorDto (API-FR-06). A guard runs
// before the controller reads the body, so that account learns no level rule.
@Injectable()
export class LevelEditorGuard implements CanActivate {
  constructor(@Inject(AUTHORIZE_LEVEL_EDITOR) private readonly authorize: AuthorizeLevelEditor) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const result = await this.authorize.execute(request.userId);
    if (!result.ok) {
      throw new ForbiddenException('This account may not update levels');
    }
    return true;
  }
}
