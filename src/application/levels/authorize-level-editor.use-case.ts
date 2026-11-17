import { err, ok, type Result } from '../../domain/shared/result.js';
import type { LevelEditors } from '../../domain/user/level-editors.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { UseCase } from '../use-case.js';

// The problem of an account outside the list of level editors. It carries a
// kind, so LoggingAspect can log it and no user id.
export type NotALevelEditor = { readonly kind: 'not-a-level-editor' };

// Input port of the level editor check (#145). LevelEditorGuard calls it
// after JwtAuthGuard, as JwtAuthGuard calls AuthenticateToken (decision 14
// of docs/architecture/classes.md). It binds UseCase, so one aspect can wrap
// it (decision 7).
export type AuthorizeLevelEditor = UseCase<UserId, Result<void, NotALevelEditor>>;

export const AUTHORIZE_LEVEL_EDITOR = Symbol('AuthorizeLevelEditor');

// Lets an account update the levels only when its user id is in the list.
export class AuthorizeLevelEditorUseCase implements AuthorizeLevelEditor {
  constructor(private readonly editors: LevelEditors) {}

  async execute(userId: UserId): Promise<Result<void, NotALevelEditor>> {
    return this.editors.includes(userId) ? ok(undefined) : err({ kind: 'not-a-level-editor' });
  }
}
