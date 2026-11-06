import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { progress } from '../src/adapters/persistence/schema.js';
import { FixedClock } from './support/fixed-clock.js';
import { createTestApp, TEST_JWT_SECRET, type TestApp } from './support/http/test-app.js';

// API-FR-02: one progress entry per user and per gameId. The userId comes
// from the bearer token, never from the body. API-FR-06: every error has the
// shared ErrorDto body.
const PASSWORD = 'correct horse battery';
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

  // Signs up and signs in. It returns the bearer token and its userId.
  async function signIn(username: string): Promise<{ token: string; userId: string }> {
    await request(server()).post('/auth/register').send({ username, password: PASSWORD });
    const login = await request(server())
      .post('/auth/login')
      .send({ username, password: PASSWORD });
    const token: string = login.body.accessToken;
    const userId = new JwtService({ secret: TEST_JWT_SECRET }).decode<{ sub: string }>(token).sub;
    return { token, userId };
  }

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
