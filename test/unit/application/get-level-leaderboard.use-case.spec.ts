import { GetLevelLeaderboardTestApi } from '../../support/testing-api/get-level-leaderboard.test-api.js';

// API-FR-03. The reader only filters. The domain ranks the board: the use
// case builds RankedBoard.of() with the rows of the reader and orders
// nothing (decision of #83). These cases pin the order of the board, the
// rank of each row and the shared rank of a tie through the use case
// (#255). Each then step states the rows of the board, with their ranks.
describe('GetLevelLeaderboardUseCase (API-FR-03)', () => {
  let board: GetLevelLeaderboardTestApi;

  beforeEach(() => {
    board = new GetLevelLeaderboardTestApi();
  });

  // The use case asks the reader for the board of the level of the query,
  // and the board that it answers holds the rows that the reader gave,
  // ranked by the domain (DS-4). The PlayerProgress spec pins each step of
  // the order of a level result through the root, so these rows differ only
  // in stars. The userId order differs from the board order, so the order
  // of a tie cannot make the test pass.
  it('should_rank_the_level_board_through_the_domain_when_the_reader_gives_entries_in_no_order', async () => {
    board.givenTheReaderGives([
      { player: 4, stars: 2, moves: 10, elapsedMs: 40_000 },
      { player: 3, stars: 0, moves: 10, elapsedMs: 40_000 },
      { player: 1, stars: 1, moves: 10, elapsedMs: 40_000 },
      { player: 2, stars: 3, moves: 10, elapsedMs: 40_000 },
    ]);

    await board.whenReadingTheBoardOf('hexa-fit', 'fit-01');

    board.thenTheBoardIs([
      { rank: 1, player: 2, stars: 3, moves: 10, elapsedMs: 40_000 },
      { rank: 2, player: 4, stars: 2, moves: 10, elapsedMs: 40_000 },
      { rank: 3, player: 1, stars: 1, moves: 10, elapsedMs: 40_000 },
      { rank: 4, player: 3, stars: 0, moves: 10, elapsedMs: 40_000 },
    ]);
    board.thenTheReaderWasAskedOnceForTheLevelOfTheQuery();
  });

  // A full tie ranks neither player first: the tied rows share a rank, and
  // the next rank skips: 1, 1, 3 (decision of #83, #195). Tied rows come out
  // by userId ascending. The reader gives them by userId descending.
  it('should_share_a_rank_skip_the_next_rank_and_list_by_user_id_when_two_level_results_tie_fully', async () => {
    board.givenTheReaderGives([
      { player: 3, stars: 1, moves: 10, elapsedMs: 40_000 },
      { player: 2, stars: 3, moves: 10, elapsedMs: 40_000 },
      { player: 1, stars: 3, moves: 10, elapsedMs: 40_000 },
    ]);

    await board.whenReadingTheBoardOf('hexa-fit', 'fit-01');

    board.thenTheBoardIs([
      { rank: 1, player: 1, stars: 3, moves: 10, elapsedMs: 40_000 },
      { rank: 1, player: 2, stars: 3, moves: 10, elapsedMs: 40_000 },
      { rank: 3, player: 3, stars: 1, moves: 10, elapsedMs: 40_000 },
    ]);
  });

  // A board lists only the players who have a result to rank (decision of
  // #82). An empty board is a board, not a failure.
  it('should_give_an_empty_board_and_succeed_when_the_reader_has_no_entries', async () => {
    await board.whenReadingTheBoardOf('hexa-fit', 'fit-01');

    board.thenTheBoardIs([]);
  });

  // #146: the API holds every level, so a level that the definitions do
  // not hold has no board. The use case asks the level store first and
  // reads no result. An unknown level, an unknown game and a level of
  // another game are each unknown.
  it.each([
    ['hexa-fit', 'no-such-level'],
    ['no-such-game', 'fit-01'],
    ['hexa-lines', 'fit-01'],
  ])(
    'should_fail_with_unknown_level_and_read_no_result_when_the_definitions_do_not_hold_the_level',
    async (game, level) => {
      board.givenTheReaderGives([{ player: 1, stars: 3, moves: 10, elapsedMs: 40_000 }]);

      await board.whenReadingTheBoardOf(game, level);

      board.thenTheReadFailsWithUnknownLevel();
      board.thenNoResultWasRead();
    },
  );

  // A broken row is still a level that the definitions hold, so its board
  // answers as a stored level does.
  it('should_give_the_level_board_when_the_definitions_hold_the_level_as_a_broken_row', async () => {
    board.givenTheLevelIsStoredAsABrokenRow();

    await board.whenReadingTheBoardOf('hexa-fit', 'fit-01');

    board.thenTheBoardIs([]);
  });

  // #193: the use case depends only on the LevelHolder role of the level
  // repository. A double of holds() alone serves it. The use case asks it
  // once, with the gameId and the levelId of the query.
  it('should_ask_holds_once_with_the_level_of_the_query_when_the_level_store_plays_only_the_level_holder_role', async () => {
    board.givenALevelHolderThatHoldsEveryLevel();

    await board.whenReadingTheBoardOf('hexa-fit', 'fit-01');

    board.thenTheBoardIs([]);
    board.thenTheHolderWasAskedOnceForTheLevelOfTheQuery();
  });

  // GetLevelLeaderboard binds UseCase, so LoggingAspect wraps it under its
  // own name (decisions 7 and 10). The use case holds no logging code.
  it('should_log_get_level_leaderboard_success_and_return_the_board_unchanged_when_logging_aspect_wraps_it', async () => {
    board.givenTheReaderGives([{ player: 1, stars: 3, moves: 10, elapsedMs: 40_000 }]);

    await board.whenReadingTheBoardThroughTheLoggingAspect('hexa-fit', 'fit-01');

    board.thenTheBoardIs([{ rank: 1, player: 1, stars: 3, moves: 10, elapsedMs: 40_000 }]);
    board.thenTheLogEntriesAre([
      { useCase: 'GetLevelLeaderboard', outcome: 'success', elapsedMs: 0 },
    ]);
  });

  // LoggingAspect logs the kind of the failure and returns it unchanged.
  it('should_log_the_unknown_level_failure_when_logging_aspect_wraps_get_level_leaderboard', async () => {
    await board.whenReadingTheBoardThroughTheLoggingAspect('hexa-fit', 'fit-99');

    board.thenTheReadFailsWithUnknownLevel();
    board.thenTheLogEntriesAre([
      {
        useCase: 'GetLevelLeaderboard',
        outcome: 'failure',
        kind: 'unknown-level',
        elapsedMs: 0,
      },
    ]);
  });
});
