import { eq } from 'drizzle-orm';
import request from 'supertest';
import { levelResults, progress, users } from '../src/adapters/persistence/schema.js';
import { signIn as signInTo, TEST_PASSWORD } from './support/http/sign-in.js';
import { storeLevels } from './support/http/stored-levels.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';
import { levelJson } from './support/level-format.js';
import { testUserId } from './support/user-ids.js';

// #103: the factory of a value object returns a failed Result for a value
// that breaks its rule. A row mapper or a reader that gets a failed Result
// for a stored value treats it as a server fault. HttpErrorFilter answers 500
// and shows no part of the row or of the rule (API-FR-06).
describe('stored values that break a rule (API-FR-06)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  const server = () => testApp.app.getHttpServer();
  const db = () => testApp.database.db;

  const internalError = (path: string) => ({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'Internal server error',
    details: [],
    path,
  });

  // The high_score column has no check constraint, so a writer that skips
  // the repository can store -1. Score.of() rejects it.
  it('should_answer_internal_error_and_keep_the_row_when_a_stored_high_score_breaks_its_rule', async () => {
    const { token, userId } = await signInTo(server(), 'ada');
    await request(server())
      .post('/v1/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({ gameId: 'hexa-lines', score: 120 });
    await db().update(progress).set({ highScore: -1 }).where(eq(progress.userId, userId));

    const read = await request(server())
      .get('/v1/progress/hexa-lines')
      .set('Authorization', `Bearer ${token}`);
    const sync = await request(server())
      .post('/v1/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({ gameId: 'hexa-lines', score: 130 });
    const board = await request(server())
      .get('/v1/leaderboard/hexa-lines')
      .set('Authorization', `Bearer ${token}`);

    expect(read.status).toBe(500);
    expect(read.body).toEqual(internalError('/v1/progress/hexa-lines'));
    expect(sync.status).toBe(500);
    expect(sync.body).toEqual(internalError('/v1/progress'));
    expect(board.status).toBe(500);
    expect(board.body).toEqual(internalError('/v1/leaderboard/hexa-lines'));
    const rows = await db().select().from(progress).where(eq(progress.userId, userId));
    expect(rows.map(({ gameId, highScore }) => ({ gameId, highScore }))).toEqual([
      { gameId: 'hexa-lines', highScore: -1 },
    ]);
  });

  // The stars column has no check constraint either. Stars.of() rejects -1,
  // and the reader of the leaderboard treats it as a server fault too.
  it.each([
    '/v1/leaderboard/hexa-fit/levels/fit-01',
    '/v1/leaderboard/hexa-fit',
    '/v1/progress/hexa-fit',
  ])('should_answer_internal_error_when_a_stored_level_result_breaks_its_rule', async (path) => {
    const { token, userId } = await signInTo(server(), 'ada');
    // The board of a level needs the stored level (#146).
    await storeLevels(testApp, levelJson('hexa-fit', 'fit-01'));
    await request(server())
      .post('/v1/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({
        gameId: 'hexa-fit',
        results: [{ levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 }],
      });
    await db().update(levelResults).set({ stars: -1 }).where(eq(levelResults.userId, userId));

    const response = await request(server()).get(path).set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(internalError(path));
  });

  // The password_hash column accepts an empty text. PasswordHash.from()
  // rejects it, so sign-in answers 500 and issues no token.
  it('should_answer_internal_error_and_issue_no_token_when_a_stored_password_hash_breaks_its_rule', async () => {
    await db()
      .insert(users)
      .values({
        id: testUserId(9),
        username: 'grace',
        usernameKey: 'grace',
        passwordHash: '',
      });

    const response = await request(server())
      .post('/v1/auth/login')
      .send({ username: 'grace', password: TEST_PASSWORD });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(internalError('/v1/auth/login'));
  });
});
