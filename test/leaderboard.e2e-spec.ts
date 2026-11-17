import request from 'supertest';
import { levelResults, progress } from '../src/adapters/persistence/schema.js';
import { DrizzleLeaderboardReader } from '../src/adapters/persistence/drizzle-leaderboard-reader.js';
import { signIn as signInTo, type SignedInUser } from './support/http/sign-in.js';
import { storeLevels } from './support/http/stored-levels.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';
import { levelJson } from './support/level-format.js';

// API-FR-03: a global leaderboard per gameId and, for Fit and Sort, a
// leaderboard per level. S3-09: both routes are behind JwtAuthGuard.
// API-FR-06: every error has the shared ErrorDto body. The routes, the rank
// and the page size come from the decision recorded on #83. The board of a
// level answers 404 when the level definitions do not hold the level (#146),
// so each test stores the levels whose boards it asks.
const FIT_01 = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 };
const FIT_02 = { levelId: 'fit-02', stars: 2, moves: 20, elapsedMs: 60000 };

describe('leaderboard endpoints (API-FR-03, API-FR-06)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  const server = () => testApp.app.getHttpServer();

  const signIn = (username: string) => signInTo(server(), username);

  const sync = (player: SignedInUser, body: object) =>
    request(server()).post('/progress').set('Authorization', `Bearer ${player.token}`).send(body);
  const board = (player: SignedInUser, path: string) =>
    request(server()).get(path).set('Authorization', `Bearer ${player.token}`);

  // The users get random ids. A full tie lists its players by userId ascending.
  const ascending = (...players: SignedInUser[]) => players.map((player) => player.userId).sort();

  // The #19 check: the board of a level holds only the results of that level
  // of that game, and the global board of a game holds only that game.
  it('should_filter_by_game_and_by_level_when_players_sync_two_games_and_two_levels', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    const linus = await signIn('linus');
    await storeLevels(
      testApp,
      levelJson('hexa-fit', 'fit-01'),
      levelJson('hexa-fit', 'fit-02'),
      levelJson('hexa-sort', 'fit-01'),
    );
    await sync(ada, { gameId: 'hexa-fit', results: [FIT_01, FIT_02] });
    await sync(grace, { gameId: 'hexa-fit', results: [{ ...FIT_01, moves: 10 }] });
    await sync(linus, { gameId: 'hexa-sort', results: [{ ...FIT_01, stars: 1 }] });
    await sync(linus, { gameId: 'hexa-lines', score: 120 });

    const level01 = await board(ada, '/leaderboard/hexa-fit/levels/fit-01');
    const level02 = await board(ada, '/leaderboard/hexa-fit/levels/fit-02');
    const fit = await board(ada, '/leaderboard/hexa-fit');
    const lines = await board(ada, '/leaderboard/hexa-lines');

    expect(level01.status).toBe(200);
    expect(level01.body).toEqual({
      gameId: 'hexa-fit',
      levelId: 'fit-01',
      entries: [
        { rank: 1, userId: grace.userId, stars: 3, moves: 10, elapsedMs: 45000 },
        { rank: 2, userId: ada.userId, stars: 3, moves: 12, elapsedMs: 45000 },
      ],
    });
    expect(level02.status).toBe(200);
    expect(level02.body).toEqual({
      gameId: 'hexa-fit',
      levelId: 'fit-02',
      entries: [{ rank: 1, userId: ada.userId, stars: 2, moves: 20, elapsedMs: 60000 }],
    });
    expect(fit.status).toBe(200);
    expect(fit.body).toEqual({
      gameId: 'hexa-fit',
      highScores: [],
      standings: [
        {
          rank: 1,
          userId: ada.userId,
          stars: 5,
          levelsCompleted: 2,
          moves: 32,
          elapsedMs: 105000,
        },
        {
          rank: 2,
          userId: grace.userId,
          stars: 3,
          levelsCompleted: 1,
          moves: 10,
          elapsedMs: 45000,
        },
      ],
    });
    expect(lines.status).toBe(200);
    expect(lines.body).toEqual({
      gameId: 'hexa-lines',
      highScores: [{ rank: 1, userId: linus.userId, highScore: 120 }],
      standings: [],
    });
  });

  // A board lists only the players who have a result to rank (decision of
  // #82). Fit gives no score, so nothing ranks Fit by score (S3-03).
  it('should_leave_the_fit_high_scores_empty_when_fit_players_sync_only_level_results', async () => {
    const ada = await signIn('ada');
    await storeLevels(testApp, levelJson('hexa-fit', 'fit-01'));
    await sync(ada, { gameId: 'hexa-fit', score: null, results: [FIT_01] });

    const fit = await board(ada, '/leaderboard/hexa-fit');

    expect(fit.status).toBe(200);
    expect(fit.body.highScores).toEqual([]);
    expect(fit.body.standings).toEqual([
      { rank: 1, userId: ada.userId, stars: 3, levelsCompleted: 1, moves: 12, elapsedMs: 45000 },
    ]);
  });

  // S3-03: a full tie ranks neither player first. The tied rows share a rank,
  // the next rank skips, and the tied rows come out by userId ascending.
  it('should_share_a_rank_and_skip_the_next_rank_when_two_players_tie_on_the_high_score', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    const linus = await signIn('linus');
    await sync(ada, { gameId: 'hexa-lines', score: 120 });
    await sync(grace, { gameId: 'hexa-lines', score: 120 });
    await sync(linus, { gameId: 'hexa-lines', score: 80 });

    const lines = await board(linus, '/leaderboard/hexa-lines');

    const [firstTied, secondTied] = ascending(ada, grace);
    expect(lines.status).toBe(200);
    expect(lines.body).toEqual({
      gameId: 'hexa-lines',
      highScores: [
        { rank: 1, userId: firstTied, highScore: 120 },
        { rank: 1, userId: secondTied, highScore: 120 },
        { rank: 3, userId: linus.userId, highScore: 80 },
      ],
      standings: [],
    });
  });

  // A game with no stored result has an empty global board: the board
  // exists, and it holds no row. GameId is open (decision 5), so any slug
  // has a global board (#146 keeps this answer).
  it('should_answer_empty_global_boards_when_no_player_has_a_result_for_the_game', async () => {
    const ada = await signIn('ada');

    const global = await board(ada, '/leaderboard/hexa-new');

    expect(global.status).toBe(200);
    expect(global.body).toEqual({ gameId: 'hexa-new', highScores: [], standings: [] });
  });

  // #146: a level that the definitions hold has a board even with no result.
  it('should_answer_an_empty_level_board_when_the_level_is_stored_and_no_player_has_a_result', async () => {
    const ada = await signIn('ada');
    await storeLevels(testApp, levelJson('hexa-sort', 'sort-01'));

    const level = await board(ada, '/leaderboard/hexa-sort/levels/sort-01');

    expect(level.status).toBe(200);
    expect(level.body).toEqual({ gameId: 'hexa-sort', levelId: 'sort-01', entries: [] });
  });

  // #146 and #134 question 1: the API holds every level, so the board of a
  // level that the definitions do not hold answers 404 with ErrorDto
  // (API-FR-06). A result of that level does not make a board. A sync of
  // that result answers 400 since #135, so the test writes the row as a
  // sync before #135 stored it.
  it.each([
    ['/leaderboard/hexa-fit/levels/no-such-level', 'No level no-such-level for gameId hexa-fit'],
    ['/leaderboard/no-such-game/levels/fit-01', 'No level fit-01 for gameId no-such-game'],
    ['/leaderboard/hexa-lines/levels/fit-01', 'No level fit-01 for gameId hexa-lines'],
  ])(
    'should_return_not_found_error_body_when_the_level_definitions_do_not_hold_the_level',
    async (path, message) => {
      const ada = await signIn('ada');
      await storeLevels(testApp, levelJson('hexa-fit', 'fit-01'));
      const db = testApp.database.db;
      await db.insert(progress).values({
        userId: ada.userId,
        gameId: 'hexa-lines',
        highScore: 120,
        updatedAt: new Date(0),
      });
      await db.insert(levelResults).values({ userId: ada.userId, gameId: 'hexa-lines', ...FIT_01 });

      const response = await board(ada, path);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message,
        details: [],
        path,
      });
    },
  );

  it('should_return_unauthorized_error_body_when_a_board_request_has_no_token', async () => {
    const global = await request(server()).get('/leaderboard/hexa-fit');
    const level = await request(server()).get('/leaderboard/hexa-fit/levels/fit-01');

    expect(global.status).toBe(401);
    expect(global.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing bearer token',
      details: [],
      path: '/leaderboard/hexa-fit',
    });
    expect(level.status).toBe(401);
    expect(level.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing bearer token',
      details: [],
      path: '/leaderboard/hexa-fit/levels/fit-01',
    });
  });

  // The mapper of the border builds the GameId and the LevelId. A value that
  // breaks its rule stops there, so the request reaches no reader method.
  it('should_return_bad_request_error_body_and_read_nothing_when_a_path_value_breaks_its_rule', async () => {
    const ada = await signIn('ada');
    const reads = [
      vi.spyOn(DrizzleLeaderboardReader.prototype, 'levelResults'),
      vi.spyOn(DrizzleLeaderboardReader.prototype, 'highScores'),
      vi.spyOn(DrizzleLeaderboardReader.prototype, 'standings'),
    ];

    const global = await board(ada, '/leaderboard/Hexa%20Fit');
    const level = await board(ada, '/leaderboard/Hexa%20Fit/levels/fit-01');
    const blankLevel = await board(ada, '/leaderboard/hexa-fit/levels/%20');
    const calls = reads.reduce((sum, read) => sum + read.mock.calls.length, 0);
    reads.forEach((read) => read.mockRestore());

    const gameProblem = 'gameId must be a lowercase slug of 1 to 64 characters, got "Hexa Fit".';
    expect(global.status).toBe(400);
    expect(global.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: [gameProblem],
      path: '/leaderboard/Hexa%20Fit',
    });
    expect(level.status).toBe(400);
    expect(level.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: [gameProblem],
      path: '/leaderboard/Hexa%20Fit/levels/fit-01',
    });
    expect(blankLevel.status).toBe(400);
    expect(blankLevel.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: [
        'levelId must be a non-blank string of 1 to 64 characters with no control character.',
      ],
      path: '/leaderboard/hexa-fit/levels/%20',
    });
    expect(calls).toBe(0);
  });

  // A reader failure is not an expected failure: HttpErrorFilter answers 500
  // and hides the message (API-FR-06).
  it('should_return_internal_error_body_when_the_leaderboard_reader_throws', async () => {
    const ada = await signIn('ada');
    const standings = vi
      .spyOn(DrizzleLeaderboardReader.prototype, 'standings')
      .mockRejectedValue(new Error('database is down'));

    const response = await board(ada, '/leaderboard/hexa-fit');
    standings.mockRestore();

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      details: [],
      path: '/leaderboard/hexa-fit',
    });
  });
});
