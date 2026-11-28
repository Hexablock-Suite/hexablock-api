import { ProgressMother } from '../../support/object-mother/progress-mother.js';
import { GetProgressTestApi } from '../../support/testing-api/get-progress.test-api.js';

describe('GetProgressUseCase (API-FR-02)', () => {
  it('should_return_stored_progress_when_user_has_progress_for_game', async () => {
    const stored = ProgressMother.startedBy(1, 'hexa-lines');
    const getProgress = new GetProgressTestApi().givenAStoredProgress(stored);

    await getProgress.whenGettingTheProgressOf(1, 'hexa-lines');

    getProgress.thenTheProgressIs(stored);
  });

  it('should_fail_with_progress_not_found_when_only_another_user_has_progress_for_game', async () => {
    const getProgress = new GetProgressTestApi().givenAStoredProgress(
      ProgressMother.startedBy(2, 'hexa-lines'),
    );

    await getProgress.whenGettingTheProgressOf(1, 'hexa-lines');

    getProgress.thenNoProgressIsFound();
  });
});
