import { GetGlobalLeaderboardTestApi } from '../../support/testing-api/get-global-leaderboard.test-api.js';

// API-FR-03. The reader only filters and sums. The domain ranks each board:
// the use case builds RankedBoard.of() with the rows of the reader and
// orders nothing (decision of #83). These cases pin the order of each board,
// the rank of each row and the shared rank of a tie through the use case
// (#255). Each then step states the rows of the board, with their ranks.
describe('GetGlobalLeaderboardUseCase (API-FR-03)', () => {
  let boards: GetGlobalLeaderboardTestApi;

  beforeEach(() => {
    boards = new GetGlobalLeaderboardTestApi();
  });

  // The use case reads both global boards of the game through the reader
  // and ranks them through the domain: the higher score wins, and the
  // standing with more stars wins (S3-03). The userId order differs from the
  // board order, so the order of a tie cannot make the test pass.
  it('should_rank_both_global_boards_through_the_domain_when_the_reader_gives_entries_in_no_order', async () => {
    boards.givenTheReaderGives({
      highScores: [
        { player: 1, score: 80 },
        { player: 2, score: 2048 },
        { player: 3, score: 120 },
      ],
      standings: [
        { player: 3, stars: 2, levels: 1 },
        { player: 4, stars: 5, levels: 2 },
      ],
    });

    await boards.whenReadingTheBoardsOf('hexa-lines');

    boards.thenTheBoardsAre({
      highScores: [
        { rank: 1, player: 2, score: 2048 },
        { rank: 2, player: 3, score: 120 },
        { rank: 3, player: 1, score: 80 },
      ],
      standings: [
        { rank: 1, player: 4, stars: 5, levels: 2 },
        { rank: 2, player: 3, stars: 2, levels: 1 },
      ],
    });
    boards.thenTheReaderWasAskedOnceForEachBoardOfTheGame();
  });

  // S3-03: more total stars wins, then more levels completed, then fewer
  // total moves, then less total time. Each row is one step of the order:
  // the two standings are equal before that step, and the better one loses
  // on every later total. The reader gives the worse standing first, and
  // the better player has the higher userId, so neither the order of the
  // reader nor the order of a tie can make a row pass.
  it.each([
    // More stars wins over fewer levels, more moves and more time.
    [
      { stars: 5, levels: 1, moves: 90, elapsedMs: 900_000 },
      { stars: 4, levels: 3, moves: 10, elapsedMs: 10_000 },
    ],
    // On equal stars, more levels wins over more moves and more time.
    [
      { stars: 5, levels: 3, moves: 90, elapsedMs: 900_000 },
      { stars: 5, levels: 2, moves: 10, elapsedMs: 10_000 },
    ],
    // On equal stars and levels, fewer moves wins over more time.
    [
      { stars: 5, levels: 2, moves: 30, elapsedMs: 900_000 },
      { stars: 5, levels: 2, moves: 31, elapsedMs: 10_000 },
    ],
    // On equal stars, levels and moves, less time wins.
    [
      { stars: 5, levels: 2, moves: 30, elapsedMs: 59_999 },
      { stars: 5, levels: 2, moves: 30, elapsedMs: 60_000 },
    ],
  ])(
    'should_rank_more_stars_then_more_levels_then_fewer_moves_then_less_time_first_when_the_reader_gives_two_standings',
    async (better, worse) => {
      boards.givenTheReaderGives({
        standings: [
          { player: 1, ...worse },
          { player: 2, ...better },
        ],
      });

      await boards.whenReadingTheBoardsOf('hexa-fit');

      boards.thenTheBoardsAre({
        standings: [
          { rank: 1, player: 2, ...better },
          { rank: 2, player: 1, ...worse },
        ],
      });
    },
  );

  // A full tie ranks neither player first. The rank of a row is 1 plus the
  // number of rows that are strictly better, so the tied rows share a rank
  // and the next rank skips: 1, 1, 3 (decision of #83, #195). Tied rows come
  // out by userId ascending. The reader gives the tied rows by userId
  // descending, so the order of the reader cannot make the test pass.
  it('should_share_a_rank_skip_the_next_rank_and_list_by_user_id_when_rows_of_both_global_boards_tie_fully', async () => {
    boards.givenTheReaderGives({
      highScores: [
        { player: 3, score: 80 },
        { player: 2, score: 120 },
        { player: 1, score: 120 },
      ],
      standings: [
        { player: 3, stars: 5, levels: 2, moves: 20, elapsedMs: 50_000 },
        { player: 2, stars: 5, levels: 2, moves: 20, elapsedMs: 50_000 },
        { player: 1, stars: 9, levels: 3, moves: 40, elapsedMs: 90_000 },
      ],
    });

    await boards.whenReadingTheBoardsOf('hexa-lines');

    boards.thenTheBoardsAre({
      highScores: [
        { rank: 1, player: 1, score: 120 },
        { rank: 1, player: 2, score: 120 },
        { rank: 3, player: 3, score: 80 },
      ],
      standings: [
        { rank: 1, player: 1, stars: 9, levels: 3, moves: 40, elapsedMs: 90_000 },
        { rank: 2, player: 2, stars: 5, levels: 2, moves: 20, elapsedMs: 50_000 },
        { rank: 2, player: 3, stars: 5, levels: 2, moves: 20, elapsedMs: 50_000 },
      ],
    });
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

    boards.thenTheBoardsAre({ highScores: [{ rank: 1, player: 1, score: 120 }] });
    boards.thenTheLogEntriesAre([
      { useCase: 'GetGlobalLeaderboard', outcome: 'success', elapsedMs: 0 },
    ]);
  });
});
