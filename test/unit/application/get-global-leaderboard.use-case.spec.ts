import { GetGlobalLeaderboardTestApi } from '../../support/testing-api/get-global-leaderboard.test-api.js';

// API-FR-03. The reader only filters and sums. The domain ranks each board:
// the use case builds RankedBoard.of() with the rows of the reader and
// orders nothing (decision of #83). The RankedBoard spec pins the order and
// the shared rank of the board.
describe('GetGlobalLeaderboardUseCase (API-FR-03)', () => {
  let boards: GetGlobalLeaderboardTestApi;

  beforeEach(() => {
    boards = new GetGlobalLeaderboardTestApi();
  });

  // The use case reads both global boards of the game through the reader
  // and ranks them through the domain (S3-03). Two entries of each board in
  // the wrong order pin that each board is ranked, not raw.
  it('should_rank_both_global_boards_through_the_domain_when_the_reader_gives_entries_in_no_order', async () => {
    boards.givenTheReaderGives({
      highScores: [
        { player: 1, score: 80 },
        { player: 2, score: 2048 },
      ],
      standings: [
        { player: 3, stars: 2, levels: 1 },
        { player: 4, stars: 5, levels: 2 },
      ],
    });

    await boards.whenReadingTheBoardsOf('hexa-lines');

    boards.thenTheBoardsAre({
      highScores: [
        { player: 2, score: 2048 },
        { player: 1, score: 80 },
      ],
      standings: [
        { player: 4, stars: 5, levels: 2 },
        { player: 3, stars: 2, levels: 1 },
      ],
    });
    boards.thenTheReaderWasAskedOnceForEachBoardOfTheGame();
  });

  // A board lists only the players who have a result to rank (decision of
  // #82). An empty board is a board, not a failure. Any gameId has a global
  // board (decision 5), so the read never fails.
  it('should_give_empty_global_boards_and_succeed_when_the_reader_has_no_entries', async () => {
    await boards.whenReadingTheBoardsOf('hexa-fit');

    boards.thenTheBoardsAre({});
  });

  // GetGlobalLeaderboard binds UseCase, so LoggingAspect wraps it under its
  // own name (decisions 7 and 10). The use case holds no logging code.
  it('should_log_get_global_leaderboard_success_and_return_the_board_unchanged_when_logging_aspect_wraps_it', async () => {
    boards.givenTheReaderGives({ highScores: [{ player: 1, score: 120 }] });

    await boards.whenReadingTheBoardsThroughTheLoggingAspect('hexa-lines');

    boards.thenTheBoardsAre({ highScores: [{ player: 1, score: 120 }] });
    boards.thenTheLogEntriesAre([
      { useCase: 'GetGlobalLeaderboard', outcome: 'success', elapsedMs: 0 },
    ]);
  });
});
