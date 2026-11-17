import { AuthorizeLevelEditorUseCase } from '../../../src/application/levels/authorize-level-editor.use-case.js';
import { LevelEditors } from '../../../src/domain/user/level-editors.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { valueOf } from '../../support/result.js';
import { testUserId } from '../../support/user-ids.js';

const userId = (n: number): UserId => valueOf(UserId.from(testUserId(n)));

// #145: only a level editor may update the levels.
describe('AuthorizeLevelEditorUseCase', () => {
  const authorize = new AuthorizeLevelEditorUseCase(LevelEditors.of([userId(1)]));

  it('should_succeed_when_the_user_id_is_a_level_editor', async () => {
    const result = await authorize.execute(userId(1));

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('should_fail_with_not_a_level_editor_when_the_user_id_is_not_in_the_list', async () => {
    const result = await authorize.execute(userId(2));

    expect(result).toEqual({ ok: false, error: { kind: 'not-a-level-editor' } });
  });

  it('should_fail_with_not_a_level_editor_when_the_list_is_empty', async () => {
    const nobody = new AuthorizeLevelEditorUseCase(LevelEditors.of([]));

    const result = await nobody.execute(userId(1));

    expect(result).toEqual({ ok: false, error: { kind: 'not-a-level-editor' } });
  });
});
