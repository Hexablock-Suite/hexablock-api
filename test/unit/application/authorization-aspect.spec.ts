import { AuthorizationAspect } from '../../../src/application/aspects/authorization-aspect.js';
import { UseCaseAspect } from '../../../src/application/aspects/use-case-aspect.js';
import type {
  UpdateLevels,
  UpdateLevelsRequest,
} from '../../../src/application/levels/update-levels.use-case.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import { err, ok } from '../../../src/domain/shared/result.js';
import { LevelEditors } from '../../../src/domain/user/level-editors.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { levelJson } from '../../support/level-format.js';
import { incomingLevel } from '../../support/level-update.js';
import { valueOf } from '../../support/result.js';
import { testUserId } from '../../support/user-ids.js';

type UpdateResult = Awaited<ReturnType<UpdateLevels['execute']>>;

const userId = (n: number): UserId => valueOf(UserId.from(testUserId(n)));

// A request of the account n with one valid level.
const requestOf = (n: number): UpdateLevelsRequest => ({
  userId: userId(n),
  levels: [incomingLevel(levelJson('hexa-fit'))],
});

// A stand-in of UpdateLevels. Its execute mock answers each request with the given result.
function innerUpdate(result: UpdateResult) {
  const execute = vi.fn<(request: UpdateLevelsRequest) => Promise<UpdateResult>>(() =>
    Promise.resolve(result),
  );
  const inner: UpdateLevels = { execute };
  return { inner, execute };
}

// #180: only a level editor may update the levels. AuthorizationAspect
// reads the UserId of the request and checks it against LevelEditors
// before the inner use case runs.
describe('AuthorizationAspect', () => {
  it('should_return_not_a_level_editor_and_not_call_the_inner_use_case_when_the_account_is_not_a_level_editor', async () => {
    const { inner, execute } = innerUpdate(ok(undefined));
    const aspect = new AuthorizationAspect(inner, LevelEditors.of([userId(1)]));

    const result = await aspect.execute(requestOf(2));

    expect(result).toEqual({ ok: false, error: { kind: 'not-a-level-editor' } });
    expect(execute).not.toHaveBeenCalled();
  });

  // An empty list lets no account update: the update fails closed (Q4).
  it('should_return_not_a_level_editor_and_not_call_the_inner_use_case_when_the_list_of_level_editors_is_empty', async () => {
    const { inner, execute } = innerUpdate(ok(undefined));
    const aspect = new AuthorizationAspect(inner, LevelEditors.of([]));

    const result = await aspect.execute(requestOf(1));

    expect(result).toEqual({ ok: false, error: { kind: 'not-a-level-editor' } });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each<UpdateResult>([
    ok(undefined),
    err({
      kind: 'invalid-levels',
      problems: [
        {
          gameId: valueOf(GameId.of('hexa-fit')),
          levelId: valueOf(LevelId.of('fit-01')),
          problem: 'inexact-witness',
        },
      ],
    }),
  ])(
    'should_call_the_inner_use_case_once_and_return_its_result_unchanged_when_the_account_is_a_level_editor',
    async (innerResult) => {
      const { inner, execute } = innerUpdate(innerResult);
      const aspect = new AuthorizationAspect(inner, LevelEditors.of([userId(1)]));
      const request = requestOf(1);

      const result = await aspect.execute(request);

      expect(result).toBe(innerResult);
      expect(execute).toHaveBeenCalledExactlyOnceWith(request);
      expect(aspect).toBeInstanceOf(UseCaseAspect);
    },
  );
});
