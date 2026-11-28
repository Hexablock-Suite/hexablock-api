import { LevelValidatorsTestApi } from '../../support/testing-api/level-validators.test-api.js';

// LevelValidators is a domain service: check() picks the strategy of the
// game of a level. Its when steps are async and return the Testing API, as
// the when steps of the use cases do (#254).
describe('LevelValidators', () => {
  let validators: LevelValidatorsTestApi;

  beforeEach(() => {
    validators = new LevelValidatorsTestApi();
  });

  it('should_build_the_level_with_the_strategy_of_its_game_when_the_game_has_level_files', async () => {
    validators.givenAStrategyFor('hexa-fit').givenAStrategyFor('hexa-sort');

    await validators.whenCheckingALevelOf('hexa-fit');

    validators.thenTheStrategyOfGotTheSectionOnce('hexa-fit');
    validators.thenTheStrategyOfWasNotAsked('hexa-sort');
    validators.thenTheCheckGivesTheLevelOf('hexa-fit');
  });

  // A Map compares object keys by reference, so a GameId built again would
  // find nothing. The registry compares with GameId.equals().
  it('should_find_one_strategy_when_the_same_game_id_is_built_twice', async () => {
    validators.givenAStrategyFor('hexa-fit');

    await validators.whenCheckingALevelOf('hexa-fit');

    validators.thenTheCheckSucceeds();
    validators.thenTheStrategyOfWasAskedOnce('hexa-fit');
  });

  // Lines and Merge have no level files (API-FR-04).
  it('should_fail_with_a_level_problem_when_no_strategy_serves_the_game', async () => {
    validators.givenAStrategyFor('hexa-fit');

    await validators.whenCheckingALevelOf('hexa-lines');

    validators.thenTheCheckFailsWith('game-without-levels');
    validators.thenTheStrategyOfWasNotAsked('hexa-fit');
  });

  it('should_return_the_problem_of_the_section_when_the_strategy_rejects_the_section', async () => {
    validators.givenAStrategyThatRejectsTheSectionOf('hexa-fit', 'invalid-section');

    await validators.whenCheckingALevelOf('hexa-fit');

    validators.thenTheCheckFailsWith('invalid-section');
  });

  // FitLevelValidator (#79) picks the Fit section, and SortLevelValidator
  // (#78) picks the Sort section. The composition root registers both.
  it('should_build_each_example_when_the_strategies_pick_the_fit_and_the_sort_section', async () => {
    validators.givenTheFitAndTheSortStrategies();

    await validators.whenCheckingTheExampleOf('hexa-fit');

    validators.thenTheCheckSucceeds();

    await validators.whenCheckingTheExampleOf('hexa-sort');

    validators.thenTheCheckSucceeds();
  });

  // Two strategies for one game are a defect of the composition root, not a
  // datum of a level, so the factory throws.
  it('should_throw_when_two_entries_name_one_game', async () => {
    validators.givenAStrategyFor('hexa-fit').givenAStrategyFor('hexa-fit');

    await validators.whenBuildingTheRegistry();

    validators.thenTheRegistryIsRefusedWith(
      new RangeError('LevelValidators takes one strategy per gameId.'),
    );
  });
});
