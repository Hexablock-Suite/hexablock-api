import { err, type Result } from '../../domain/shared/result.js';
import type { LevelEditors } from '../../domain/user/level-editors.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { NotALevelEditor } from '../levels/not-a-level-editor.js';
import type { UseCase } from '../use-case.js';
import { UseCaseAspect } from './use-case-aspect.js';

// A request that names the signed-in account. The HTTP adapter reads the
// UserId that JwtAuthGuard sets and puts it in the request.
export interface AuthorizedRequest {
  readonly userId: UserId;
}

// Lets only a level editor reach the inner use case (§3.5, security and
// authorization; #145, #180). It reads the UserId of the request and checks
// it against LevelEditors. An account outside the list gets a failed Result
// of kind not-a-level-editor, and the inner use case never runs. An empty
// list lets no account in: the check fails closed. The error type of the
// inner use case holds NotALevelEditor, so the aspect keeps the response
// type of UseCaseAspect. The aspect writes no log entry: LoggingAspect wraps
// it and logs each rejected attempt (rule R-logger-in-aspects).
export class AuthorizationAspect<
  TRequest extends AuthorizedRequest,
  TValue,
  TError extends { readonly kind: string },
> extends UseCaseAspect<TRequest, Result<TValue, TError | NotALevelEditor>> {
  constructor(
    inner: UseCase<TRequest, Result<TValue, TError | NotALevelEditor>>,
    private readonly editors: LevelEditors,
  ) {
    super(inner);
  }

  override execute(request: TRequest): Promise<Result<TValue, TError | NotALevelEditor>> {
    if (!this.editors.includes(request.userId)) {
      return Promise.resolve(err({ kind: 'not-a-level-editor' }));
    }
    return super.execute(request);
  }
}
