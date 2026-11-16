import request from 'supertest';
import { levels } from '../src/adapters/persistence/schema.js';
import { signIn as signInTo } from './support/http/sign-in.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';
import { levelJson } from './support/level-format.js';
import { a5FailingFitJson } from './support/level-update.js';

// API-FR-04: read and update the level definitions of Fit and Sort. The read
// has no guard. The update is behind JwtAuthGuard (Q4): an idempotent batch
// that answers 204. API-FR-06: every error has the shared ErrorDto body.
const LEVELS_PATH = '/levels';

// The ErrorDto of a 400 that lists one problem per broken level.
function badRequest(...details: string[]) {
  return {
    statusCode: 400,
    error: 'Bad Request',
    message: 'Request validation failed',
    details,
    path: LEVELS_PATH,
  };
}

describe('level endpoints (API-FR-04, API-FR-06)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  const server = () => testApp.app.getHttpServer();

  const tokenOf = async (username: string) => (await signInTo(server(), username)).token;

  const list = () => request(server()).get(LEVELS_PATH);
  const update = (token: string, body: object) =>
    request(server()).put(LEVELS_PATH).set('Authorization', `Bearer ${token}`).send(body);

  // The check of #20: the read gives the levels of each gameId.
  it('should_read_the_levels_of_each_game_id_when_a_signed_in_client_updated_them', async () => {
    const token = await tokenOf('ada');

    const updated = await update(token, {
      levels: [levelJson('hexa-sort'), levelJson('hexa-fit')],
    });
    const read = await list();

    expect(updated.status).toBe(204);
    expect(updated.text).toBe('');
    expect(read.status).toBe(200);
    expect(read.body).toEqual({ levels: [levelJson('hexa-fit'), levelJson('hexa-sort')] });
  });

  it('should_answer_ok_with_no_level_when_no_level_is_stored', async () => {
    const read = await list();

    expect(read.status).toBe(200);
    expect(read.body).toEqual({ levels: [] });
  });

  // The use case checks the whole batch before the first save.
  it('should_answer_bad_request_and_save_no_level_of_the_batch_when_a_fit_level_fails_a5', async () => {
    const token = await tokenOf('ada');
    await update(token, { levels: [levelJson('hexa-sort')] });

    const rejected = await update(token, {
      levels: [levelJson('hexa-sort', 'sort-01', 2), a5FailingFitJson()],
    });
    const read = await list();

    expect(rejected.status).toBe(400);
    expect(rejected.body).toEqual(
      badRequest('gameId "hexa-fit", levelId "fit-01": inexact-witness'),
    );
    expect(read.body).toEqual({ levels: [levelJson('hexa-sort')] });
  });

  // S3-10: a lower version fails, and an equal version passes, so a retry
  // of the same batch is safe.
  it('should_reject_a_lower_version_and_accept_an_equal_one_when_the_level_is_stored', async () => {
    const token = await tokenOf('ada');
    await update(token, { levels: [levelJson('hexa-fit', 'fit-01', 2)] });

    const lower = await update(token, { levels: [levelJson('hexa-fit', 'fit-01', 1)] });
    const equal = await update(token, { levels: [levelJson('hexa-fit', 'fit-01', 2)] });
    const read = await list();

    expect(lower.status).toBe(400);
    expect(lower.body).toEqual(badRequest('gameId "hexa-fit", levelId "fit-01": older-version'));
    expect(equal.status).toBe(204);
    expect(read.body).toEqual({ levels: [levelJson('hexa-fit', 'fit-01', 2)] });
  });

  it('should_answer_unauthorized_and_save_nothing_when_the_update_has_no_token', async () => {
    const rejected = await request(server())
      .put(LEVELS_PATH)
      .send({ levels: [levelJson('hexa-fit')] });
    const read = await list();

    expect(rejected.status).toBe(401);
    expect(rejected.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing bearer token',
      details: [],
      path: LEVELS_PATH,
    });
    expect(read.body).toEqual({ levels: [] });
  });

  // A body with the wrong shape and a level of a game with no level files
  // are client errors too.
  it('should_answer_bad_request_and_save_nothing_when_the_body_has_the_wrong_shape_or_a_game_has_no_levels', async () => {
    const token = await tokenOf('ada');
    const lines = { ...levelJson('hexa-sort', 'lines-01'), gameId: 'hexa-lines' };

    const noArray = await update(token, { levels: levelJson('hexa-fit') });
    const badOrder = await update(token, { levels: [{ ...levelJson('hexa-fit'), order: 0 }] });
    const noLevels = await update(token, { levels: [levelJson('hexa-sort'), lines] });
    const read = await list();

    expect(noArray.status).toBe(400);
    expect(noArray.body).toEqual(badRequest('levels must be an array of objects'));
    expect(badOrder.status).toBe(400);
    expect(badOrder.body).toEqual(badRequest('gameId "hexa-fit", levelId "fit-01": invalid-order'));
    expect(noLevels.status).toBe(400);
    expect(noLevels.body).toEqual(
      badRequest('gameId "hexa-lines", levelId "lines-01": game-without-levels'),
    );
    expect(read.body).toEqual({ levels: [] });
  });

  // The game ids of the product are hexa-fit, hexa-sort, hexa-lines and
  // hexa-merge. The progress and the levels of one game share its id, so a
  // level of the game fit names no game of the product.
  it('should_store_the_fit_level_under_hexa_fit_and_reject_the_game_id_fit_when_a_client_plays_hexa_fit', async () => {
    const token = await tokenOf('ada');
    const fitLevel = levelJson('hexa-fit');
    const result = { levelId: 'fit-01', stars: 3, moves: 4, elapsedMs: 30000 };

    const synced = await request(server())
      .post('/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({ gameId: 'hexa-fit', results: [result] });
    const updated = await update(token, { levels: [fitLevel] });
    const read = await list();
    const oldId = await update(token, { levels: [{ ...fitLevel, gameId: 'fit' }] });

    expect(synced.status).toBe(200);
    expect(synced.body).toMatchObject({ gameId: 'hexa-fit', results: [result] });
    expect(updated.status).toBe(204);
    expect(read.body).toEqual({ levels: [fitLevel] });
    expect(oldId.status).toBe(400);
    expect(oldId.body).toEqual(badRequest('gameId "fit", levelId "fit-01": game-without-levels'));
  });

  // A stored row that no strategy accepts is a server fault: list() throws
  // for every level. The client gets the body of an unexpected failure, with
  // no stack, no SQL and no rule of the row.
  it('should_answer_the_unexpected_error_body_without_internal_data_when_a_stored_row_breaks_a_rule', async () => {
    await testApp.database.db.insert(levels).values({
      ...levelJson('hexa-fit'),
      section: { figure: [] },
    });

    const read = await list();

    expect(read.status).toBe(500);
    expect(read.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      details: [],
      path: LEVELS_PATH,
    });
    expect(read.text).not.toMatch(/levels row|invalid-section|select|\bat /);
  });
});
