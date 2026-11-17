import { eq } from 'drizzle-orm';
import request from 'supertest';
import { levelResults, progress } from '../src/adapters/persistence/schema.js';
import { signIn as signInTo } from './support/http/sign-in.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';

// #135: a value that a client sends must fit its column and the bounds of
// its value object, so it stops at the border with 400 and the text of its
// rule. A stored row keeps the values that it holds, so a read of it and a
// total over it still work (decision 2 of #135).
const FIT_LEVEL = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 };
const COLUMN_MAX = 2_147_483_647;

describe('progress value bounds (#135, API-FR-02, API-FR-06)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  const server = () => testApp.app.getHttpServer();
  const db = () => testApp.database.db;

  const sync = (token: string, body: object) =>
    request(server()).post('/progress').set('Authorization', `Bearer ${token}`).send(body);

  const badRequest = (detail: string) => ({
    statusCode: 400,
    error: 'Bad Request',
    message: 'Request validation failed',
    details: [detail],
    path: '/progress',
  });

  const longGameId = 'a'.repeat(200);
  const longLevelId = 'f'.repeat(10_000);
  const levelIdProblem =
    'levelId must be a non-blank string of 1 to 64 characters with no control character.';

  // The five requests of the table of #135. Each one answered 200 or 500
  // before the bounds.
  it.each([
    [
      'a gameId of 200 characters with stars 9',
      { gameId: longGameId, results: [{ ...FIT_LEVEL, stars: 9 }] },
      `gameId must be a lowercase slug of 1 to 64 characters, got "${longGameId}".`,
    ],
    [
      'a levelId of 10000 characters',
      { gameId: 'hexa-fit', results: [{ ...FIT_LEVEL, levelId: longLevelId }] },
      levelIdProblem,
    ],
    [
      'stars over the integer column',
      { gameId: 'hexa-fit', results: [{ ...FIT_LEVEL, stars: 3_000_000_000 }] },
      `stars must be a non-negative integer of at most ${COLUMN_MAX}, got 3000000000.`,
    ],
    [
      'moves over the integer column',
      { gameId: 'hexa-fit', results: [{ ...FIT_LEVEL, moves: 3_000_000_000 }] },
      `moves must be a non-negative integer of at most ${COLUMN_MAX}, got 3000000000.`,
    ],
    [
      'a levelId with a NUL character',
      { gameId: 'hexa-fit', results: [{ ...FIT_LEVEL, levelId: 'fi\u0000t' }] },
      levelIdProblem,
    ],
  ])(
    'should_answer_bad_request_with_the_rule_and_store_nothing_when_a_sync_sends_a_value_over_its_bound',
    async (_case, body, problem) => {
      const { token, userId } = await signInTo(server(), 'ada');

      const response = await sync(token, body);

      expect(response.status).toBe(400);
      expect(response.body).toEqual(badRequest(problem));
      expect(await db().select().from(progress).where(eq(progress.userId, userId))).toEqual([]);
      expect(await db().select().from(levelResults).where(eq(levelResults.userId, userId))).toEqual(
        [],
      );
    },
  );

  // The bounds apply where a value comes in, not where a stored row is
  // rebuilt. A row stored before the bounds still reads.
  it('should_read_the_stored_row_when_it_holds_values_over_the_incoming_bounds', async () => {
    const { token, userId } = await signInTo(server(), 'ada');
    await db()
      .insert(progress)
      .values({ userId, gameId: 'hexa-fit', highScore: null, updatedAt: new Date(0) });
    await db().insert(levelResults).values({
      userId,
      gameId: 'hexa-fit',
      levelId: longLevelId,
      stars: 9,
      moves: 12,
      elapsedMs: 45000,
    });

    const response = await request(server())
      .get('/progress/hexa-fit')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([
      { levelId: longLevelId, stars: 9, moves: 12, elapsedMs: 45000 },
    ]);
  });

  // A total of stars or moves is a sum of stored rows. It can exceed one
  // integer column, and the global board still reads it.
  it('should_rank_the_totals_when_the_sums_of_the_stored_rows_exceed_the_integer_column', async () => {
    const { token, userId } = await signInTo(server(), 'ada');
    await db()
      .insert(progress)
      .values({ userId, gameId: 'hexa-fit', highScore: null, updatedAt: new Date(0) });
    const row = { userId, gameId: 'hexa-fit', stars: COLUMN_MAX, moves: COLUMN_MAX, elapsedMs: 1 };
    await db()
      .insert(levelResults)
      .values([
        { ...row, levelId: 'fit-01' },
        { ...row, levelId: 'fit-02' },
      ]);

    const response = await request(server())
      .get('/leaderboard/hexa-fit')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.standings).toEqual([
      {
        rank: 1,
        userId,
        stars: 2 * COLUMN_MAX,
        levelsCompleted: 2,
        moves: 2 * COLUMN_MAX,
        elapsedMs: 2,
      },
    ]);
  });
});
