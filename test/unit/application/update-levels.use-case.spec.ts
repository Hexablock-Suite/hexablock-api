import { levelJson } from '../../support/level-format.js';
import { a5FailingFitJson } from '../../support/level-update.js';
import { UpdateLevelsTestApi } from '../../support/testing-api/update-levels.test-api.js';

// The update of API-FR-04 (#81). The use case checks every level of the
// batch through LevelValidators before it saves any level. Then it saves
// level by level, each in its own transaction, through
// LevelRepository.update(). The change of each update runs the version rule
// of S3-10, so a lower version fails and an equal version passes. The
// request carries the UserId of the account, as LevelDtoMapper builds it.
// The use case reads no user id: AuthorizationAspect checks it before (#180).
describe('UpdateLevelsUseCase (API-FR-04)', () => {
  let update: UpdateLevelsTestApi;

  beforeEach(() => {
    update = new UpdateLevelsTestApi();
  });

  it('should_save_every_level_when_each_level_of_the_batch_passes_its_check', async () => {
    await update.whenUpdating([levelJson('hexa-sort'), levelJson('hexa-fit')]);

    update.thenTheUpdateSucceeds();
    update.thenTheStoredLevelsAre([levelJson('hexa-fit'), levelJson('hexa-sort')]);
  });

  // An empty batch breaks no rule, so it succeeds and saves nothing.
  it('should_succeed_and_save_nothing_when_the_batch_holds_no_level', async () => {
    await update.whenUpdating([]);

    update.thenTheUpdateSucceeds();
    update.thenNoLevelWasSaved();
    update.thenTheStoredLevelsAre([]);
  });

  // The whole batch passes its check before the first save. So a broken
  // level leaves every stored level as it was, also the levels of the
  // batch that pass their check. Each broken level gives one problem.
  it('should_save_no_level_and_report_each_broken_level_when_a_fit_level_of_the_batch_fails_a5', async () => {
    const lines = { ...levelJson('hexa-sort', 'lines-01'), gameId: 'hexa-lines' };
    update.givenTheStoredLevels([levelJson('hexa-sort')]);

    await update.whenUpdating([levelJson('hexa-sort', 'sort-01', 2), a5FailingFitJson(), lines]);

    update.thenTheUpdateFailsWith([
      ['hexa-fit', 'fit-01', 'inexact-witness'],
      ['hexa-lines', 'lines-01', 'game-without-levels'],
    ]);
    update.thenNoLevelWasSaved();
    update.thenTheStoredLevelsAre([levelJson('hexa-sort')]);
  });

  // The version rule runs inside update(), under the lock of the level. A
  // lower version saves nothing for that level. Each level is its own
  // aggregate, so the other levels of the batch are saved.
  it('should_reject_the_lower_version_and_save_the_other_levels_when_a_stored_level_is_newer', async () => {
    update.givenTheStoredLevels([levelJson('hexa-fit', 'fit-01', 2)]);

    await update.whenUpdating([levelJson('hexa-fit', 'fit-01', 1), levelJson('hexa-sort')]);

    update.thenTheUpdateFailsWith([['hexa-fit', 'fit-01', 'older-version']]);
    update.thenTheStoredLevelsAre([levelJson('hexa-fit', 'fit-01', 2), levelJson('hexa-sort')]);
  });

  // #147: a stored row that breaks a rule has no level, but its version
  // column can still hold a valid version. The version rule of S3-10 then
  // compares with it: a lower version saves nothing and gives older-version.
  // The other levels of the batch are saved.
  it('should_reject_the_lower_version_and_keep_the_broken_row_when_the_broken_row_holds_a_higher_version', async () => {
    update.givenABrokenRowOf(levelJson('hexa-fit'), 3);

    await update.whenUpdating([levelJson('hexa-fit', 'fit-01', 2), levelJson('hexa-sort')]);

    update.thenTheUpdateFailsWith([['hexa-fit', 'fit-01', 'older-version']]);
    update.thenTheUnavailableLevelsAre([
      { gameId: 'hexa-fit', levelId: 'fit-01', reason: 'invalid-figure' },
    ]);
    update.thenTheStoredLevelsAre([levelJson('hexa-sort')]);
  });

  // An equal version passes, so the same packaged level replaces its broken row.
  it('should_replace_the_broken_row_when_the_level_has_the_version_of_the_broken_row', async () => {
    update.givenABrokenRowOf(levelJson('hexa-fit'), 3);

    await update.whenUpdating([levelJson('hexa-fit', 'fit-01', 3)]);

    update.thenTheUpdateSucceeds();
    update.thenTheUnavailableLevelsAre([]);
    update.thenTheStoredLevelsAre([levelJson('hexa-fit', 'fit-01', 3)]);
  });

  // A version column that breaks its rule gives no version to compare, so
  // any valid version replaces the row.
  it('should_replace_the_broken_row_with_any_version_when_the_stored_version_breaks_its_rule', async () => {
    update.givenABrokenRowWithABrokenVersionOf(levelJson('hexa-fit'));

    await update.whenUpdating([levelJson('hexa-fit', 'fit-01', 1)]);

    update.thenTheUpdateSucceeds();
    update.thenTheUnavailableLevelsAre([]);
    update.thenTheStoredLevelsAre([levelJson('hexa-fit', 'fit-01', 1)]);
  });

  // S3-10: an equal version passes, so a repeated batch is safe.
  it('should_accept_the_equal_version_and_keep_each_level_when_the_same_batch_is_sent_again', async () => {
    const batch = [levelJson('hexa-fit'), levelJson('hexa-sort')];
    update.givenAnUpdateOf(batch);

    await update.whenUpdating(batch);

    update.thenTheUpdateSucceeds();
    update.thenTheStoredLevelsAre([levelJson('hexa-fit'), levelJson('hexa-sort')]);
  });

  // Each level is saved in its own transaction. A save that throws stops
  // the batch and keeps the levels saved before it. A retry of the same
  // batch saves each level again: an equal version passes. The use case
  // depends only on the LevelUpdater role, so the level store of this case
  // has only update() (#193).
  it('should_keep_the_levels_saved_before_a_failed_save_and_save_every_level_when_the_batch_is_retried', async () => {
    const batch = [levelJson('hexa-fit'), levelJson('hexa-sort'), levelJson('hexa-fit', 'fit-02')];
    update.givenTheSecondSaveFails();

    await update.whenUpdating(batch);

    update.thenTheUpdateRejectsWithTheSaveFailure();
    update.thenTheStoredLevelsAre([levelJson('hexa-fit')]);

    await update.whenUpdating(batch);

    update.thenTheUpdateSucceeds();
    update.thenTheStoredLevelsAre([
      levelJson('hexa-fit'),
      levelJson('hexa-fit', 'fit-02'),
      levelJson('hexa-sort'),
    ]);
  });

  // Two updates can race between the check and the save. The newer update
  // saves first here. The version rule runs again inside update(), so the
  // older update loses, and the use case reports a level problem, not an
  // error.
  it('should_report_older_version_for_the_losing_update_when_a_newer_update_saves_between_its_check_and_its_save', async () => {
    update
      .givenTheStoredLevels([levelJson('hexa-fit', 'fit-01', 1)])
      .givenANewerUpdateSavesBeforeEachSave([levelJson('hexa-fit', 'fit-01', 3)]);

    await update.whenUpdating([levelJson('hexa-fit', 'fit-01', 2)]);

    update.thenTheUpdateFailsWith([['hexa-fit', 'fit-01', 'older-version']]);
    update.thenTheStoredLevelsAre([levelJson('hexa-fit', 'fit-01', 3)]);
  });
});
