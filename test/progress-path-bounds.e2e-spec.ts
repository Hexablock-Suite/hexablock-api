import request from 'supertest';
import { SequenceUserIdGenerator } from './support/auth/fakes.js';
import { signIn as signInTo } from './support/http/sign-in.js';
import { storeLevels } from './support/http/stored-levels.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';
import { levelJson } from './support/level-format.js';
import { testUserId } from './support/user-ids.js';

// Decision 3 of #135 (2026-11-17,
// https://github.com/Hexablock-Suite/hexablock-api/issues/135#issuecomment-6953000419):
// the bounds of gameId and levelId hold at every border. A path of the
// progress and leaderboard routes and the body of PUT /levels answer 400
// with the ErrorDto body and the rule text for an id outside them. An id
// of 64 characters keeps the answer that it had before the bounds.
const LONGEST_GAME_ID = 'a'.repeat(64);
const LONGEST_LEVEL_ID = 'f'.repeat(64);
const TOO_LONG_GAME_ID = 'a'.repeat(65);
const TOO_LONG_LEVEL_ID = 'f'.repeat(65);

const GAME_ID_PROBLEM = `gameId must be a lowercase slug of 1 to 64 characters, got "${TOO_LONG_GAME_ID}".`;
const LEVEL_ID_PROBLEM =
  'levelId must be a non-blank string of 1 to 64 characters with no control character.';

// The ErrorDto of a 400 with one detail.
function badRequest(path: string, detail: string) {
  return {
    statusCode: 400,
    error: 'Bad Request',
    message: 'Request validation failed',
    details: [detail],
    path,
  };
}

describe('id bounds at every border (#135 decision 3, API-FR-02, API-FR-06)', () => {
  let testApp: TestApp;

  // The user ids come in sign-up order, so the first account, ada, is the
  // only level editor.
  beforeEach(async () => {
    testApp = await createTestApp([], {
      userIds: new SequenceUserIdGenerator(),
      levelEditorIds: [testUserId(1)],
    });
  });

  afterEach(async () => {
    await testApp.close();
  });

  const server = () => testApp.app.getHttpServer();

  const read = (token: string, path: string) =>
    request(server()).get(path).set('Authorization', `Bearer ${token}`);

  const updateLevels = (token: string, levels: object[]) =>
    request(server()).put('/v1/levels').set('Authorization', `Bearer ${token}`).send({ levels });

  it.each([
    [
      '/v1/progress/:gameId with a gameId of 65 characters',
      `/v1/progress/${TOO_LONG_GAME_ID}`,
      GAME_ID_PROBLEM,
    ],
    [
      '/v1/leaderboard/:gameId with a gameId of 65 characters',
      `/v1/leaderboard/${TOO_LONG_GAME_ID}`,
      GAME_ID_PROBLEM,
    ],
    [
      '/v1/leaderboard/:gameId/levels/:levelId with a gameId of 65 characters',
      `/v1/leaderboard/${TOO_LONG_GAME_ID}/levels/fit-01`,
      GAME_ID_PROBLEM,
    ],
    [
      '/v1/leaderboard/:gameId/levels/:levelId with a levelId of 65 characters',
      `/v1/leaderboard/hexa-fit/levels/${TOO_LONG_LEVEL_ID}`,
      LEVEL_ID_PROBLEM,
    ],
    [
      '/v1/leaderboard/:gameId/levels/:levelId with a NUL in the levelId',
      '/v1/leaderboard/hexa-fit/levels/fi%00t',
      LEVEL_ID_PROBLEM,
    ],
  ])(
    'should_answer_bad_request_with_the_rule_when_a_path_holds_an_id_outside_its_bounds',
    async (_case, path, problem) => {
      const { token } = await signInTo(server(), 'ada');
      await storeLevels(testApp, levelJson('hexa-fit', 'fit-01'));

      const response = await read(token, path);

      expect(response.status).toBe(400);
      expect(response.body).toEqual(badRequest(path, problem));
    },
  );

  it.each([
    ['a levelId of 65 characters', TOO_LONG_LEVEL_ID],
    ['a tab in the levelId', 'fit\t01'],
    ['a NUL in the levelId', 'fi\u0000t'],
  ])(
    'should_answer_bad_request_and_store_no_level_when_put_levels_sends_a_level_id_outside_its_bounds',
    async (_case, levelId) => {
      const { token } = await signInTo(server(), 'ada');

      const response = await updateLevels(token, [levelJson('hexa-fit', levelId)]);

      expect(response.status).toBe(400);
      expect(response.body).toEqual(badRequest('/v1/levels', `levels[0]: ${LEVEL_ID_PROBLEM}`));
      expect((await request(server()).get('/v1/levels')).body).toEqual({ levels: [] });
    },
  );

  it('should_answer_not_found_when_the_progress_path_holds_a_game_id_of_64_characters', async () => {
    const { token } = await signInTo(server(), 'ada');

    const response = await read(token, `/v1/progress/${LONGEST_GAME_ID}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      message: `No progress for gameId ${LONGEST_GAME_ID}`,
    });
  });

  it('should_answer_ok_with_empty_boards_when_the_leaderboard_path_holds_a_game_id_of_64_characters', async () => {
    const { token } = await signInTo(server(), 'ada');

    const response = await read(token, `/v1/leaderboard/${LONGEST_GAME_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.gameId).toBe(LONGEST_GAME_ID);
  });

  it('should_answer_not_found_when_the_level_board_path_holds_a_game_id_of_64_characters', async () => {
    const { token } = await signInTo(server(), 'ada');

    const response = await read(token, `/v1/leaderboard/${LONGEST_GAME_ID}/levels/fit-01`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      message: `No level fit-01 for gameId ${LONGEST_GAME_ID}`,
    });
  });

  it('should_store_the_level_and_answer_its_board_when_the_level_id_has_64_characters', async () => {
    const { token } = await signInTo(server(), 'ada');

    const updated = await updateLevels(token, [levelJson('hexa-fit', LONGEST_LEVEL_ID)]);
    const board = await read(token, `/v1/leaderboard/hexa-fit/levels/${LONGEST_LEVEL_ID}`);

    expect(updated.status).toBe(204);
    expect((await request(server()).get('/v1/levels')).body).toEqual({
      levels: [levelJson('hexa-fit', LONGEST_LEVEL_ID)],
    });
    expect(board.status).toBe(200);
    expect(board.body).toEqual({ gameId: 'hexa-fit', levelId: LONGEST_LEVEL_ID, entries: [] });
  });
});
