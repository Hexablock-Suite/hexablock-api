import {
  AuthorizationAspectTestApi,
  type InnerUpdateAnswer,
} from '../../support/testing-api/authorization-aspect.test-api.js';

// #180: only a level editor may update the levels. AuthorizationAspect
// reads the UserId of the request and checks it against LevelEditors
// before the inner use case runs.
describe('AuthorizationAspect', () => {
  let authorization: AuthorizationAspectTestApi;

  beforeEach(() => {
    authorization = new AuthorizationAspectTestApi();
  });

  it('should_return_not_a_level_editor_and_not_call_the_inner_use_case_when_the_account_is_not_a_level_editor', async () => {
    authorization.givenTheLevelEditors([1]).givenTheInnerUpdateAnswers('saved');

    await authorization.whenUserUpdates(2);

    authorization.thenTheUpdateFailsWithNotALevelEditor();
    authorization.thenTheInnerUpdateDidNotRun();
  });

  // An empty list lets no account update: the update fails closed (Q4).
  it('should_return_not_a_level_editor_and_not_call_the_inner_use_case_when_the_list_of_level_editors_is_empty', async () => {
    authorization.givenTheLevelEditors([]).givenTheInnerUpdateAnswers('saved');

    await authorization.whenUserUpdates(1);

    authorization.thenTheUpdateFailsWithNotALevelEditor();
    authorization.thenTheInnerUpdateDidNotRun();
  });

  it.each<InnerUpdateAnswer>(['saved', { invalid: [['hexa-fit', 'fit-01', 'inexact-witness']] }])(
    'should_call_the_inner_use_case_once_and_return_its_result_unchanged_when_the_account_is_a_level_editor',
    async (answer) => {
      authorization.givenTheLevelEditors([1]).givenTheInnerUpdateAnswers(answer);

      await authorization.whenUserUpdates(1);

      authorization.thenTheAspectGivesTheInnerResultUnchanged();
      authorization.thenTheInnerUpdateRanOnceWithTheRequest();
      authorization.thenTheAspectIsAUseCaseAspect();
    },
  );
});
