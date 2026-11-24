import { eq } from 'drizzle-orm';
import request from 'supertest';
import { levelResults, levels, progress } from '../src/adapters/persistence/schema.js';
import { signIn as signInTo } from './support/http/sign-in.js';
import { storeLevels } from './support/http/stored-levels.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';
import { levelJson } from './support/level-format.js';

// DS-6, decided on #134: the most stars that a result can carry is the
// number of star thresholds of its level, and the API checks the stars of a
// result against its level (#135). Each level of the format document has 3
// star thresholds. A result for a level that the API does not hold breaks the
// body, not the route, so it answers 400.
const play = (levelId: string, stars: number) => ({ levelId, stars, moves: 12, elapsedMs: 45000 });

describe('progress stars against the level (#135, DS-6, API-FR-02)', () => {
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
    request(server()).post('/v1/progress').set('Authorization', `Bearer ${token}`).send(body);

  const badRequest = (detail: string) => ({
    statusCode: 400,
    error: 'Bad Request',
    message: 'Request validation failed',
    details: [detail],
    path: '/v1/progress',
  });

  const storedRows = async (userId: string) => ({
    progress: await db().select().from(progress).where(eq(progress.userId, userId)),
    results: await db().select().from(levelResults).where(eq(levelResults.userId, userId)),
  });

  it('should_answer_bad_request_and_store_nothing_when_the_stars_exceed_the_star_thresholds_of_the_level', async () => {
    const { token, userId } = await signInTo(server(), 'ada');
    await storeLevels(testApp, levelJson('hexa-fit', 'fit-01'), levelJson('hexa-sort', 'sort-01'));

    const fit = await sync(token, { gameId: 'hexa-fit', results: [play('fit-01', 4)] });
    const sort = await sync(token, {
      gameId: 'hexa-sort',
      score: 7,
      results: [play('sort-01', 9)],
    });

    expect(fit.status).toBe(400);
    expect(fit.body).toEqual(
      badRequest(
        'stars of level fit-01 must be at most 3, the count of its star thresholds, got 4.',
      ),
    );
    expect(sort.status).toBe(400);
    expect(sort.body).toEqual(
      badRequest(
        'stars of level sort-01 must be at most 3, the count of its star thresholds, got 9.',
      ),
    );
    expect(await storedRows(userId)).toEqual({ progress: [], results: [] });
  });

  it('should_store_the_result_when_its_stars_equal_the_count_of_star_thresholds', async () => {
    const { token, userId } = await signInTo(server(), 'ada');
    await storeLevels(testApp, levelJson('hexa-fit', 'fit-01'));

    const response = await sync(token, { gameId: 'hexa-fit', results: [play('fit-01', 3)] });

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([play('fit-01', 3)]);
    expect((await storedRows(userId)).results.map((row) => row.stars)).toEqual([3]);
  });

  it.each([
    ['an unstored levelId', 'hexa-fit', 'fit-99'],
    ['a level of another game', 'hexa-sort', 'fit-01'],
    ['a game with no level files', 'hexa-lines', 'lines-01'],
  ])(
    'should_answer_bad_request_with_unknown_level_and_store_nothing_when_the_api_holds_no_level_of_the_result',
    async (_case, gameId, levelId) => {
      const { token, userId } = await signInTo(server(), 'ada');
      await storeLevels(testApp, levelJson('hexa-fit', 'fit-01'));

      const response = await sync(token, { gameId, results: [play(levelId, 1)] });

      expect(response.status).toBe(400);
      expect(response.body).toEqual(badRequest(`No level ${levelId} for gameId ${gameId}.`));
      expect(await storedRows(userId)).toEqual({ progress: [], results: [] });
    },
  );

  // A stored row that breaks a rule has no star thresholds (#147).
  it('should_answer_bad_request_with_unknown_level_when_the_stored_row_of_the_level_is_broken', async () => {
    const { token, userId } = await signInTo(server(), 'ada');
    await db()
      .insert(levels)
      .values({
        gameId: 'hexa-fit',
        levelId: 'fit-01',
        order: 1,
        version: 1,
        topology: 'hex',
        section: { broken: true },
      });

    const response = await sync(token, { gameId: 'hexa-fit', results: [play('fit-01', 1)] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(badRequest('No level fit-01 for gameId hexa-fit.'));
    expect(await storedRows(userId)).toEqual({ progress: [], results: [] });
  });

  // Lines and Merge sync a score and no result, so they need no level.
  it('should_store_the_score_when_a_sync_has_no_result_and_no_level_is_stored', async () => {
    const { token } = await signInTo(server(), 'ada');

    const response = await sync(token, { gameId: 'hexa-lines', score: 120 });

    expect(response.status).toBe(200);
    expect(response.body.highScore).toBe(120);
  });
});
