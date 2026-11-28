import { levelJson } from '../../support/level-format.js';
import { GetLevelsTestApi } from '../../support/testing-api/get-levels.test-api.js';

// The read of API-FR-04 (#81). It gives every valid stored level in the
// order of LevelRepository.list(): by gameId, then by levelId, compared as
// text. #147: it gives each stored row that breaks a rule apart. #219: the
// use case holds no logger. LoggingAspect logs one entry per broken row
// through unavailableLevelEntries().
describe('GetLevelsUseCase (API-FR-04)', () => {
  let getLevels: GetLevelsTestApi;

  beforeEach(() => {
    getLevels = new GetLevelsTestApi();
  });

  it('should_give_every_stored_level_by_game_and_level_id_when_levels_are_stored', async () => {
    const stored = [
      levelJson('hexa-sort'),
      levelJson('hexa-fit', 'fit-9'),
      levelJson('hexa-fit', 'fit-10', 2),
    ];
    getLevels.givenTheStoredLevels(stored);

    await getLevels.whenGettingTheLevels();

    getLevels.thenTheLevelsAre([stored[2], stored[1], stored[0]]);
    getLevels.thenTheUnavailableLevelsAre([]);
  });

  it('should_give_no_level_when_no_level_is_stored', async () => {
    await getLevels.whenGettingTheLevels();

    getLevels.thenTheReadGives({ levels: [], unavailable: [] });
  });

  // A broken row does not hide the other levels. The read gives its key and
  // the code of its rule.
  it('should_give_the_valid_levels_and_each_broken_row_when_a_stored_row_breaks_a_rule', async () => {
    getLevels
      .givenABrokenRowOf(levelJson('hexa-fit'))
      .givenTheStoredLevels([levelJson('hexa-sort')]);

    await getLevels.whenGettingTheLevels();

    getLevels.thenTheLevelsAre([levelJson('hexa-sort')]);
    getLevels.thenTheUnavailableLevelsAre([
      { gameId: 'hexa-fit', levelId: 'fit-01', reason: 'invalid-figure' },
    ]);
  });

  // #193: the use case depends only on the LevelLister role of the level
  // repository. A double of list() alone serves it, and the read gives what
  // list() gives, unchanged.
  it('should_give_what_list_gives_when_the_level_store_plays_only_the_level_lister_role', async () => {
    const listed = {
      levels: [],
      unavailable: [{ gameId: 'hexa-fit', levelId: 'fit-01', reason: 'invalid-figure' }],
    } as const;
    getLevels.givenALevelListerThatGives(listed);

    await getLevels.whenGettingTheLevels();

    getLevels.thenTheReadGives(listed);
    getLevels.thenTheListerWasAskedOnce();
  });
});

// #219: LoggingAspect wraps GetLevels, as AppModule wires it. The aspect
// writes one unavailable-level entry per broken row, and then the success.
describe('GetLevels inside LoggingAspect (#147, #219)', () => {
  let getLevels: GetLevelsTestApi;

  beforeEach(() => {
    getLevels = new GetLevelsTestApi();
  });

  it('should_log_one_unavailable_level_entry_per_broken_row_and_then_success_when_logging_aspect_wraps_get_levels', async () => {
    getLevels
      .givenABrokenRowOf(levelJson('hexa-fit'))
      .givenABrokenRowOf(levelJson('hexa-fit', 'fit-02'))
      .givenTheStoredLevels([levelJson('hexa-sort')]);

    await getLevels.whenGettingTheLevelsThroughTheLoggingAspect();

    getLevels.thenTheUnavailableLevelsAre([
      { gameId: 'hexa-fit', levelId: 'fit-01', reason: 'invalid-figure' },
      { gameId: 'hexa-fit', levelId: 'fit-02', reason: 'invalid-figure' },
    ]);
    getLevels.thenTheLogEntriesAre([
      {
        useCase: 'GetLevels',
        outcome: 'unavailable-level',
        gameId: 'hexa-fit',
        levelId: 'fit-01',
        reason: 'invalid-figure',
      },
      {
        useCase: 'GetLevels',
        outcome: 'unavailable-level',
        gameId: 'hexa-fit',
        levelId: 'fit-02',
        reason: 'invalid-figure',
      },
      { useCase: 'GetLevels', outcome: 'success', elapsedMs: 0 },
    ]);
  });

  it('should_log_only_success_when_logging_aspect_wraps_get_levels_and_no_row_is_broken', async () => {
    getLevels.givenTheStoredLevels([levelJson('hexa-sort')]);

    await getLevels.whenGettingTheLevelsThroughTheLoggingAspect();

    getLevels.thenTheLogEntriesAre([{ useCase: 'GetLevels', outcome: 'success', elapsedMs: 0 }]);
  });

  // A log write that fails does not change the read.
  it('should_give_the_levels_when_the_logger_throws_and_logging_aspect_wraps_get_levels', async () => {
    getLevels.givenABrokenRowOf(levelJson('hexa-fit')).givenTheLoggerThrows();

    await getLevels.whenGettingTheLevelsThroughTheLoggingAspect();

    getLevels.thenTheReadGives({
      levels: [],
      unavailable: [{ gameId: 'hexa-fit', levelId: 'fit-01', reason: 'invalid-figure' }],
    });
  });
});
