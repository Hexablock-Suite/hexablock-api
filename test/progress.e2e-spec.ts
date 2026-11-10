import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DrizzleProgressRepository } from '../src/adapters/persistence/drizzle-progress-repository.js';
import { progress } from '../src/adapters/persistence/schema.js';
import { FixedClock } from './support/fixed-clock.js';
import { signIn as signInTo } from './support/http/sign-in.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';

// API-FR-02: one progress entry per user and per gameId. The userId comes
// from the bearer token, never from the body. API-FR-06: every error has the
// shared ErrorDto body.
const AT = new Date('2026-11-06T10:00:00.000Z');
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const LATER = new Date(AT.getTime() + FIVE_MINUTES_MS);
const FIT_LEVEL = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 };

describe('progress endpoints (API-FR-02, API-FR-06)', () => {
  let testApp: TestApp;
  let clock: FixedClock;

  beforeEach(async () => {
    clock = new FixedClock(AT);
    testApp = await createTestApp([], { clock });
  });

  afterEach(async () => {
    await testApp.close();
  });

  const server = () => testApp.app.getHttpServer();

  const signIn = (username: string) => signInTo(server(), username);

  const sync = (token: string, body: object) =>
    request(server()).post('/progress').set('Authorization', `Bearer ${token}`).send(body);
  const read = (token: string, gameId: string) =>
    request(server()).get(`/progress/${gameId}`).set('Authorization', `Bearer ${token}`);

  it('should_read_back_two_entries_when_user_syncs_two_variants', async () => {
    const { token } = await signIn('ada');

    const lines = await sync(token, { gameId: 'hexa-lines', score: 120 });
    const fit = await sync(token, { gameId: 'hexa-fit', results: [FIT_LEVEL] });
    const readLines = await read(token, 'hexa-lines');
    const readFit = await read(token, 'hexa-fit');

    const linesEntry = {
      gameId: 'hexa-lines',
      highScore: 120,
      updatedAt: AT.toISOString(),
      results: [],
    };
    const fitEntry = {
      gameId: 'hexa-fit',
      highScore: null,
      updatedAt: AT.toISOString(),
      results: [FIT_LEVEL],
    };
    expect(lines.status).toBe(200);
    expect(lines.body).toEqual(linesEntry);
    expect(fit.status).toBe(200);
    expect(fit.body).toEqual(fitEntry);
    expect(readLines.status).toBe(200);
    expect(readLines.body).toEqual(linesEntry);
    expect(readFit.status).toBe(200);
    expect(readFit.body).toEqual(fitEntry);
  });

  it('should_keep_one_entry_with_highest_score_when_same_variant_syncs_twice', async () => {
    const { token, userId } = await signIn('ada');
    await sync(token, { gameId: 'hexa-lines', score: 120 });
    clock.advanceBy(FIVE_MINUTES_MS);

    const second = await sync(token, { gameId: 'hexa-lines', score: 80 });
    const readBack = await read(token, 'hexa-lines');

    const entry = {
      gameId: 'hexa-lines',
      highScore: 120,
      updatedAt: LATER.toISOString(),
      results: [],
    };
    expect(second.status).toBe(200);
    expect(second.body).toEqual(entry);
    expect(readBack.body).toEqual(entry);
    const rows = await testApp.database.db
      .select()
      .from(progress)
      .where(eq(progress.userId, userId));
    expect(rows).toHaveLength(1);
  });

  // An equal score is not higher, so the high score stays. The sync still
  // moves updatedAt to its instant.
  it('should_keep_high_score_and_move_updated_at_forward_when_an_equal_score_syncs', async () => {
    const { token, userId } = await signIn('ada');
    await sync(token, { gameId: 'hexa-lines', score: 120 });
    clock.advanceBy(FIVE_MINUTES_MS);

    const second = await sync(token, { gameId: 'hexa-lines', score: 120 });
    const readBack = await read(token, 'hexa-lines');

    const entry = {
      gameId: 'hexa-lines',
      highScore: 120,
      updatedAt: LATER.toISOString(),
      results: [],
    };
    expect(second.status).toBe(200);
    expect(second.body).toEqual(entry);
    expect(readBack.body).toEqual(entry);
    const rows = await testApp.database.db
      .select()
      .from(progress)
      .where(eq(progress.userId, userId));
    expect(rows.map((row) => [row.highScore, row.updatedAt])).toEqual([[120, LATER]]);
  });

  it('should_save_progress_for_token_user_when_body_names_another_user', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');

    await sync(ada.token, { gameId: 'hexa-lines', score: 120, userId: grace.userId });
    const graceRead = await read(grace.token, 'hexa-lines');
    const adaRead = await read(ada.token, 'hexa-lines');

    expect(graceRead.status).toBe(404);
    expect(adaRead.status).toBe(200);
    expect(adaRead.body.highScore).toBe(120);
  });

  it('should_return_bad_request_error_body_and_save_nothing_when_game_id_is_missing', async () => {
    const { token, userId } = await signIn('ada');

    const response = await sync(token, { score: 120 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: ['gameId must be a string'],
      path: '/progress',
    });
    const rows = await testApp.database.db
      .select()
      .from(progress)
      .where(eq(progress.userId, userId));
    expect(rows).toEqual([]);
  });

  it('should_return_bad_request_error_body_and_keep_entry_when_score_breaks_its_rule', async () => {
    const { token } = await signIn('ada');
    await sync(token, { gameId: 'hexa-lines', score: 120 });

    const response = await sync(token, { gameId: 'hexa-lines', score: -1 });
    const readBack = await read(token, 'hexa-lines');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: ['score must be a non-negative integer, got -1.'],
      path: '/progress',
    });
    expect(readBack.body.highScore).toBe(120);
  });

  const storedRows = (userId: string) =>
    testApp.database.db.select().from(progress).where(eq(progress.userId, userId));

  it('should_return_bad_request_error_body_and_save_nothing_when_score_is_an_unsafe_integer', async () => {
    const { token, userId } = await signIn('ada');

    const response = await sync(token, { gameId: 'hexa-lines', score: 2 ** 53 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: ['score must be a non-negative integer, got 9007199254740992.'],
      path: '/progress',
    });
    expect(await storedRows(userId)).toEqual([]);
  });

  // JSON.stringify writes -0 as 0, so the test sends the raw JSON text.
  // -0 is a non-negative integer: -0 < 0 is false.
  it('should_save_a_zero_high_score_when_score_is_negative_zero', async () => {
    const { token, userId } = await signIn('ada');

    const response = await request(server())
      .post('/progress')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{"gameId":"hexa-lines","score":-0}');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      gameId: 'hexa-lines',
      highScore: 0,
      updatedAt: AT.toISOString(),
      results: [],
    });
    expect((await storedRows(userId)).map((row) => row.highScore)).toEqual([0]);
  });

  // The DTO declares score as nullable: null means no score in this sync.
  it('should_save_entry_without_high_score_when_score_is_null', async () => {
    const { token, userId } = await signIn('ada');

    const response = await sync(token, { gameId: 'hexa-fit', score: null, results: [FIT_LEVEL] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      gameId: 'hexa-fit',
      highScore: null,
      updatedAt: AT.toISOString(),
      results: [FIT_LEVEL],
    });
    expect((await storedRows(userId)).map((row) => row.highScore)).toEqual([null]);
  });

  it('should_return_bad_request_error_body_and_save_nothing_when_results_is_not_an_array_of_objects', async () => {
    const { token, userId } = await signIn('ada');

    const notArray = await sync(token, { gameId: 'hexa-fit', results: 'fit-01' });
    const nullInside = await sync(token, { gameId: 'hexa-fit', results: [FIT_LEVEL, null] });

    const error = {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: ['results must be an array of objects'],
      path: '/progress',
    };
    expect(notArray.status).toBe(400);
    expect(notArray.body).toEqual(error);
    expect(nullInside.status).toBe(400);
    expect(nullInside.body).toEqual(error);
    expect(await storedRows(userId)).toEqual([]);
  });

  // The route declares a 400 response for a gameId that breaks its rule.
  it('should_return_bad_request_error_body_when_read_game_id_is_not_a_slug', async () => {
    const { token } = await signIn('ada');

    const response = await read(token, 'Hexa%20Lines');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: ['gameId must be a lowercase slug, got "Hexa Lines".'],
      path: '/progress/Hexa%20Lines',
    });
  });

  // A repository failure is not an expected failure: HttpErrorFilter answers
  // 500 and hides the message (API-FR-06). The read uses find().
  it('should_return_internal_error_body_when_progress_repository_find_throws', async () => {
    const { token } = await signIn('ada');
    await sync(token, { gameId: 'hexa-lines', score: 120 });
    const find = vi
      .spyOn(DrizzleProgressRepository.prototype, 'find')
      .mockRejectedValue(new Error('database is down'));

    const readResponse = await read(token, 'hexa-lines');
    find.mockRestore();

    expect(readResponse.status).toBe(500);
    expect(readResponse.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      details: [],
      path: '/progress/hexa-lines',
    });
  });

  // The sync reads, changes and saves the progress in one update() call.
  it('should_return_internal_error_body_and_save_nothing_when_progress_repository_update_throws', async () => {
    const { token, userId } = await signIn('ada');
    const update = vi
      .spyOn(DrizzleProgressRepository.prototype, 'update')
      .mockRejectedValue(new Error('database is down'));

    const response = await sync(token, { gameId: 'hexa-lines', score: 120 });
    update.mockRestore();

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      details: [],
      path: '/progress',
    });
    expect(await storedRows(userId)).toEqual([]);
  });

  it('should_return_unauthorized_error_body_when_sync_has_no_token', async () => {
    const response = await request(server())
      .post('/progress')
      .send({ gameId: 'hexa-lines', score: 120 });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing bearer token',
      details: [],
      path: '/progress',
    });
  });

  it('should_return_unauthorized_error_body_when_read_has_no_token', async () => {
    const response = await request(server()).get('/progress/hexa-lines');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing bearer token',
      details: [],
      path: '/progress/hexa-lines',
    });
  });

  it('should_return_not_found_error_body_when_user_has_no_progress_for_variant', async () => {
    const { token } = await signIn('ada');

    const response = await read(token, 'hexa-sort');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'No progress for gameId hexa-sort',
      details: [],
      path: '/progress/hexa-sort',
    });
  });
});
