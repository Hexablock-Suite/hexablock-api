import { ProgressMother } from '../../support/object-mother/progress-mother.js';
import { SyncProgressTestApi } from '../../support/testing-api/sync-progress.test-api.js';

const { START, FIVE_MINUTES_LATER } = ProgressMother;

describe('SyncProgressUseCase (API-FR-02)', () => {
  let sync: SyncProgressTestApi;

  beforeEach(() => {
    sync = new SyncProgressTestApi();
  });

  it('should_save_new_progress_with_score_at_clock_instant_when_user_has_no_progress_for_game', async () => {
    await sync.whenSyncing({ score: 120 });

    sync.thenTheSyncSucceeds();
    sync.thenTheStoredProgressIs('hexa-lines', { highScore: 120, updatedAt: START, results: [] });
    sync.thenTheSyncGivesTheStoredProgressOf('hexa-lines');
  });

  it('should_keep_one_progress_with_highest_score_when_same_game_syncs_twice', async () => {
    sync.givenASync({ score: 120 }).givenFiveMinutesPass();

    await sync.whenSyncing({ score: 80 });

    sync.thenTheSyncGivesTheStoredProgressOf('hexa-lines');
    sync.thenTheStoredProgressIs('hexa-lines', { highScore: 120, updatedAt: FIVE_MINUTES_LATER });
  });

  it('should_keep_separate_progress_when_user_syncs_two_games', async () => {
    sync.givenASync({ gameId: 'hexa-lines', score: 120 });

    await sync.whenSyncing({ gameId: 'hexa-merge', score: 300 });

    sync.thenTheStoredProgressIs('hexa-lines', { highScore: 120 });
    sync.thenTheStoredProgressIs('hexa-merge', { highScore: 300 });
  });

  it('should_record_level_results_without_score_when_request_has_only_results', async () => {
    const level = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 };

    await sync.whenSyncing({ gameId: 'hexa-fit', score: undefined, results: [level] });

    sync.thenTheSyncSucceeds();
    sync.thenTheStoredProgressIs('hexa-fit', {
      highScore: null,
      updatedAt: START,
      results: [level],
    });
  });

  // A better result for a stored levelId takes its place (DS-4, DS-12).
  it('should_store_better_level_result_and_keep_other_levels_when_stored_progress_syncs_again', async () => {
    const first = { levelId: 'fit-01', stars: 1, moves: 20, elapsedMs: 60000 };
    const retry = { levelId: 'fit-01', stars: 3, moves: 9, elapsedMs: 30000 };
    const next = { levelId: 'fit-02', stars: 2, moves: 12, elapsedMs: 45000 };
    sync.givenASync({ gameId: 'hexa-fit', score: undefined, results: [first] });

    await sync.whenSyncing({ gameId: 'hexa-fit', score: undefined, results: [retry, next] });

    sync.thenTheSyncGivesTheStoredProgressOf('hexa-fit');
    sync.thenTheStoredProgressIs('hexa-fit', { highScore: null, results: [retry, next] });
  });

  // DS-12 check: a better result and then a worse one for the same level
  // keep the better one, and the opposite order stores the same row. DS-4
  // gives the order: more stars, then fewer moves, then less time. A row
  // gives the two results in the order of the syncs. Both rows expect the
  // same stored progress.
  const betterResult = { levelId: 'fit-01', stars: 3, moves: 30, elapsedMs: 90000 };
  const worseResult = { levelId: 'fit-01', stars: 2, moves: 9, elapsedMs: 30000 };
  it.each([
    [betterResult, worseResult],
    [worseResult, betterResult],
  ])(
    'should_store_better_level_result_in_either_order_when_a_worse_result_of_same_level_syncs',
    async (first, second) => {
      sync.givenASync({ gameId: 'hexa-fit', score: undefined, results: [first] });

      await sync.whenSyncing({ gameId: 'hexa-fit', score: undefined, results: [second] });

      sync.thenTheStoredProgressIsExactly('hexa-fit', {
        updatedAt: START,
        results: [betterResult],
      });
      sync.thenTheSyncGivesTheStoredProgressOf('hexa-fit');
    },
  );

  // Two overlapping syncs run one after the other. The domain keeps the
  // highest score (API-FR-02, DS-12). The sync that runs last answers the
  // stored progress. A row gives the two scores in the order of the syncs.
  it.each([
    [500, 100],
    [100, 500],
  ])(
    'should_store_highest_score_in_either_order_when_two_syncs_of_same_game_overlap',
    async (firstScore, secondScore) => {
      await sync.whenTwoSyncsOverlap({ score: firstScore }, { score: secondScore });

      sync.thenTheStoredProgressIs('hexa-lines', { highScore: 500 });
      sync.thenBothSyncsSucceed();
      sync.thenTheSyncGivesTheStoredProgressOf('hexa-lines');
    },
  );

  // Each sync reads the progress that the other one saved, so no level
  // result is lost (DEF-02). A row gives the two levels in the order of the syncs.
  const firstLevel = { levelId: 'fit-01', stars: 1, moves: 20, elapsedMs: 60000 };
  const secondLevel = { levelId: 'fit-02', stars: 3, moves: 9, elapsedMs: 30000 };
  it.each([
    [firstLevel, secondLevel],
    [secondLevel, firstLevel],
  ])(
    'should_store_both_levels_in_either_order_when_two_syncs_add_different_levels',
    async (first, second) => {
      await sync.whenTwoSyncsOverlap(
        { gameId: 'hexa-fit', score: undefined, results: [first] },
        { gameId: 'hexa-fit', score: undefined, results: [second] },
      );

      // The port gives the results by levelId, whatever the sync order.
      sync.thenTheStoredProgressIs('hexa-fit', { results: [firstLevel, secondLevel] });
      // The answer of the last sync keeps the stored result first, then the new one.
      sync.thenTheLastSyncGivesTheResults([first, second]);
    },
  );

  // The stale sync starts first, but reaches the repository only after the
  // other sync saved. It reads the Clock under the lock, so updatedAt does
  // not move back (DEF-02).
  it('should_keep_latest_updated_at_when_a_stale_sync_saves_last', async () => {
    await sync.whenAStaleSyncSavesLast({ score: 500 }, { score: 100 });

    sync.thenTheStoredProgressIs('hexa-lines', {
      highScore: 500,
      updatedAt: FIVE_MINUTES_LATER,
    });
    sync.thenTheSyncGivesTheStoredProgressOf('hexa-lines');
  });

  // #97: the use case checks no instant. The Clock gives a SyncInstant, which
  // guards the rule of a valid instant. The types forbid a Clock that gives
  // another value, so it is a fault of the server, not of the request
  // (decision 11). The guard of the aggregate throws, so the client gets a
  // 500, not a 400.
  it('should_reject_and_save_nothing_when_clock_gives_no_sync_instant', async () => {
    const level = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 };
    sync.givenASync({ gameId: 'hexa-fit', score: 120 }).givenTheClockGivesNoSyncInstant();

    await sync.whenSyncing();

    sync.thenTheSyncRejectsWith(new TypeError('The instant must be a SyncInstant.'));

    await sync.whenSyncing({ gameId: 'hexa-fit', score: 900, results: [level] });

    sync.thenTheSyncRejectsWith(new TypeError('The instant must be a SyncInstant.'));
    sync.thenNoProgressIsStoredFor('hexa-lines');
    sync.thenTheStoredProgressIs('hexa-fit', { highScore: 120, updatedAt: START, results: [] });
  });

  // The repository fails with unknown-user when no user has the id of the
  // key (#137). The use case returns it as a ProgressProblem.
  it('should_fail_with_unknown_user_and_store_nothing_when_the_repository_knows_no_such_user', async () => {
    sync.givenTheProgressStoreKnowsNoUser();

    await sync.whenSyncing({ score: 120 });

    sync.thenTheSyncFailsWith({ kind: 'unknown-user' });
    sync.thenNoProgressIsStoredFor('hexa-lines');
  });

  // The request types forbid this value. The mapper of the border builds
  // every value, so a value that is not a Score is a defect of the caller.
  // The guard of the aggregate throws, and the use case saves nothing
  // (decision 11).
  it('should_throw_the_guard_and_keep_stored_progress_when_aggregate_rejects_a_request_value', async () => {
    sync.givenASync({ score: 120 }).givenFiveMinutesPass();

    await sync.whenSyncingAScoreThatIsNotAScore(500);

    sync.thenTheSyncRejectsWith(new TypeError('A high score must be a Score.'));
    sync.thenTheStoredProgressIs('hexa-lines', { highScore: 120, updatedAt: START });
  });
});

// DS-6, decided on #134: the most stars that a result can carry is the
// number of star thresholds of its level. The use case reads the levels
// before the lock of the progress, so a broken rule saves nothing (#135).
describe('SyncProgressUseCase and the stars of a level (DS-6)', () => {
  const play = (levelId: string, stars: number) => ({
    levelId,
    stars,
    moves: 12,
    elapsedMs: 45000,
  });
  let sync: SyncProgressTestApi;

  beforeEach(() => {
    sync = new SyncProgressTestApi();
  });

  it('should_fail_with_unknown_level_and_save_nothing_when_the_api_holds_no_level_of_a_result', async () => {
    const unknown = play('fit-99', 1);

    await sync.whenSyncing({ gameId: 'hexa-fit', results: [play('fit-01', 3), unknown] });

    sync.thenTheSyncFailsWith({ kind: 'unknown-level', result: unknown });
    sync.thenNoProgressIsStoredFor('hexa-fit');
  });

  it('should_fail_with_unknown_level_when_the_level_is_of_another_game', async () => {
    await sync.whenSyncing({ gameId: 'hexa-sort', results: [play('fit-01', 1)] });

    sync.thenTheSyncFailsWithTheKind('unknown-level');
  });

  // A stored row that breaks a rule has no star thresholds (#147), so it
  // holds no level for a result.
  it('should_fail_with_unknown_level_when_the_stored_row_of_the_level_is_broken', async () => {
    sync.givenTheStoredRowOfTheLevelIsBroken('hexa-fit', 'fit-01');

    await sync.whenSyncing({ gameId: 'hexa-fit', results: [play('fit-01', 1)] });

    sync.thenTheSyncFailsWithTheKind('unknown-level');
  });

  it('should_fail_with_too_many_stars_and_save_nothing_when_the_stars_exceed_the_star_thresholds', async () => {
    const over = play('fit-02', 4);

    await sync.whenSyncing({ gameId: 'hexa-fit', results: [play('fit-01', 3), over] });

    sync.thenTheSyncFailsWith({ kind: 'too-many-stars', result: over, most: 3 });
    sync.thenNoProgressIsStoredFor('hexa-fit');
  });

  it('should_save_the_result_when_its_stars_equal_the_count_of_star_thresholds', async () => {
    await sync.whenSyncing({ gameId: 'hexa-fit', results: [play('fit-01', 3)] });

    sync.thenTheSyncSucceeds();
    sync.thenTheStoredProgressIs('hexa-fit', { results: [play('fit-01', 3)] });
  });

  // A sync with no result reads no level, so Lines and Merge need no level (#171).
  it('should_read_no_level_when_the_sync_has_no_result', async () => {
    sync.givenTheLevelStoreHolds([]);

    await sync.whenSyncing({ gameId: 'hexa-lines', score: 120 });

    sync.thenTheSyncSucceeds();
    sync.thenNoLevelWasRead();
  });

  // One read per sync (#217): the sync asks findFor() once, with the gameId
  // and every result in the order of the request, and never lists every
  // stored level (#171).
  it('should_read_the_levels_with_one_call_when_the_sync_has_two_results', async () => {
    const first = { levelId: 'fit-02', stars: 1, moves: 20, elapsedMs: 60000 };
    const second = { levelId: 'fit-01', stars: 3, moves: 9, elapsedMs: 30000 };
    sync.givenTheLevelStoreHolds([['hexa-fit', ['fit-01', 'fit-02']]]);

    await sync.whenSyncing({ gameId: 'hexa-fit', results: [first, second] });

    sync.thenTheSyncSucceeds();
    sync.thenTheLevelsWereReadOnceFor('hexa-fit', [first, second]);
  });

  it('should_read_the_levels_with_one_call_when_the_sync_has_three_results', async () => {
    const results = [
      { levelId: 'fit-01', stars: 1, moves: 20, elapsedMs: 60000 },
      { levelId: 'fit-02', stars: 2, moves: 15, elapsedMs: 50000 },
      { levelId: 'fit-03', stars: 3, moves: 9, elapsedMs: 30000 },
    ];
    sync.givenTheLevelStoreHolds([['hexa-fit', ['fit-01', 'fit-02', 'fit-03']]]);

    await sync.whenSyncing({ gameId: 'hexa-fit', results });

    sync.thenTheSyncSucceeds();
    sync.thenTheLevelsWereReadOnceFor('hexa-fit', results);
    sync.thenTheStoredProgressIs('hexa-fit', { results });
  });

  // The order of the request decides the first failure, not the order in
  // which the repository gives the levels. A row gives the two broken
  // results in the order of the request.
  const overStars = play('fit-02', 4);
  const unknownLevel = play('fit-99', 1);
  it.each([
    [[overStars, unknownLevel], { kind: 'too-many-stars', result: overStars, most: 3 } as const],
    [[unknownLevel, overStars], { kind: 'unknown-level', result: unknownLevel } as const],
  ])(
    'should_fail_with_the_first_broken_result_of_the_request_when_two_results_break_a_rule',
    async (results, failure) => {
      await sync.whenSyncing({ gameId: 'hexa-fit', results });

      sync.thenTheSyncFailsWith(failure);
      sync.thenNoProgressIsStoredFor('hexa-fit');
    },
  );
});
