import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { levels } from '../src/adapters/persistence/schema.js';
import { signIn as signInTo } from './support/http/sign-in.js';
import { SequenceUserIdGenerator } from './support/auth/fakes.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';
import { appLevelJson, SQUARE_AND_TRIANGLE_FIT_LEVELS } from './support/app-levels.js';
import { levelJson } from './support/level-format.js';
import { a5FailingFitJson } from './support/level-update.js';
import { testUserId } from './support/user-ids.js';

// API-FR-04: read and update the level definitions of Fit and Sort. The read
// has no guard. The update is behind JwtAuthGuard and LevelEditorGuard (Q4,
// #145): an idempotent batch that answers 204. API-FR-06: every error has the
// shared ErrorDto body.
const LEVELS_PATH = '/v1/levels';

// The user ids come in sign-up order, so the first account, ada, is the
// only level editor, and the second account, eve, is not one.
function levelsTestApp(): Promise<TestApp> {
  return createTestApp([], {
    userIds: new SequenceUserIdGenerator(),
    levelEditorIds: [testUserId(1)],
  });
}

// The ErrorDto of a 403 for an account outside the list of level editors.
const FORBIDDEN = {
  statusCode: 403,
  error: 'Forbidden',
  message: 'This account may not update levels',
  details: [],
  path: LEVELS_PATH,
};

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
    testApp = await levelsTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  const server = () => testApp.app.getHttpServer();

  const tokenOf = async (username: string) => (await signInTo(server(), username)).token;

  const list = () => request(server()).get(LEVELS_PATH);
  const update = (token: string, body: object) =>
    request(server()).put(LEVELS_PATH).set('Authorization', `Bearer ${token}`).send(body);

  // #145: an account outside the list gets 403, and the API saves nothing.
  it('should_answer_forbidden_and_keep_the_stored_levels_when_the_account_is_not_a_level_editor', async () => {
    const editor = await tokenOf('ada');
    const other = await tokenOf('eve');
    await update(editor, { levels: [levelJson('hexa-fit', 'fit-01', 1)] });

    const rejected = await update(other, {
      levels: [levelJson('hexa-fit', 'fit-01', 2), levelJson('hexa-sort')],
    });
    const read = await list();

    expect(rejected.status).toBe(403);
    expect(rejected.body).toEqual(FORBIDDEN);
    expect(read.body).toEqual({ levels: [levelJson('hexa-fit', 'fit-01', 1)] });
  });

  it('should_answer_no_content_and_save_the_batch_when_the_account_is_a_level_editor', async () => {
    const editor = await tokenOf('ada');
    await update(editor, { levels: [levelJson('hexa-fit', 'fit-01', 1)] });

    const updated = await update(editor, {
      levels: [levelJson('hexa-fit', 'fit-01', 2), levelJson('hexa-sort')],
    });
    const read = await list();

    expect(updated.status).toBe(204);
    expect(read.body).toEqual({
      levels: [levelJson('hexa-fit', 'fit-01', 2), levelJson('hexa-sort')],
    });
  });

  // The guard runs before the controller reads the body, so an account
  // outside the list learns nothing about the rules of a level.
  it('should_answer_forbidden_with_no_level_problem_when_the_account_is_not_a_level_editor_and_the_body_is_wrong', async () => {
    await tokenOf('ada');
    const other = await tokenOf('eve');

    const rejected = await update(other, { levels: [a5FailingFitJson()] });

    expect(rejected.status).toBe(403);
    expect(rejected.body).toEqual(FORBIDDEN);
    expect((await list()).body).toEqual({ levels: [] });
  });

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

  // #229: the composition root knows the square and the triangle topologies,
  // so one update with the bundled files of the app saves each of them.
  it('should_save_every_level_when_the_update_holds_the_bundled_square_and_triangle_fit_files', async () => {
    const token = await tokenOf('ada');
    const bundled = SQUARE_AND_TRIANGLE_FIT_LEVELS.map((name) => appLevelJson(name));

    const updated = await update(token, { levels: bundled });
    const read = await list();

    expect(updated.status).toBe(204);
    expect(read.body).toEqual({ levels: bundled });
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

  // A lower version fails in the save of its own level. Each level is its
  // own aggregate, so the new level of the same batch is saved.
  it('should_answer_bad_request_for_the_stale_level_and_save_the_new_level_when_a_batch_mixes_a_lower_version_and_a_new_level', async () => {
    const token = await tokenOf('ada');
    await update(token, { levels: [levelJson('hexa-fit', 'fit-01', 2)] });

    const mixed = await update(token, {
      levels: [levelJson('hexa-fit', 'fit-01', 1), levelJson('hexa-sort')],
    });
    const read = await list();

    expect(mixed.status).toBe(400);
    expect(mixed.body).toEqual(badRequest('gameId "hexa-fit", levelId "fit-01": older-version'));
    expect(read.body).toEqual({
      levels: [levelJson('hexa-fit', 'fit-01', 2), levelJson('hexa-sort')],
    });
  });

  // The strategy of the gameId reads the section. A section that is no Fit
  // section gives a level problem, never a server error: a value that is no
  // object gives invalid-section, and a missing field gives the problem of
  // that field.
  it.each([
    [null, 'invalid-section'],
    [42, 'invalid-section'],
    [{ figure: [[0, 0]] }, 'invalid-pieces'],
  ])(
    'should_answer_bad_request_and_save_nothing_when_the_section_is_not_a_fit_section',
    async (section, problem) => {
      const token = await tokenOf('ada');

      const rejected = await update(token, { levels: [{ ...levelJson('hexa-fit'), section }] });
      const read = await list();

      expect(rejected.status).toBe(400);
      expect(rejected.body).toEqual(badRequest(`gameId "hexa-fit", levelId "fit-01": ${problem}`));
      expect(read.body).toEqual({ levels: [] });
    },
  );

  // #223: each level problem that a client sees reaches it through the
  // update, and the other tests of this file reach the rest. A broken part
  // of a field gives the code of the field, never a part code: a cell of 0.5
  // gives invalid-figure, a rotation of 1.5 gives invalid-witness, a negative
  // star limit gives invalid-stars, and a negative seed gives invalid-source
  // (decision 11). The Fit example with no piece c covers five of the six
  // cells of its figure, so A5 fails on the area.
  const fit = levelJson('hexa-fit');
  const sort = levelJson('hexa-sort');
  const fitWithoutPieceC = {
    ...fit,
    section: {
      ...fit.section,
      pieces: (fit.section.pieces as unknown[]).slice(0, 2),
      witness: (fit.section.witness as unknown[]).slice(0, 2),
    },
  };
  it.each([
    [{ ...fit, version: 0 }, 'invalid-version'],
    [{ ...fit, topology: 'Hex' }, 'invalid-topology'],
    [{ ...fit, topology: 'cube' }, 'unknown-topology'],
    [{ ...fit, section: { ...fit.section, figure: [[0.5, 0]] } }, 'invalid-figure'],
    [
      { ...fit, section: { ...fit.section, witness: [{ piece: 'a', rotation: 1.5, at: [0, 0] }] } },
      'invalid-witness',
    ],
    [
      { ...fit, section: { ...fit.section, stars: [{ maxMoves: -1, maxElapsedMs: 0 }] } },
      'invalid-stars',
    ],
    [fitWithoutPieceC, 'unequal-area'],
    [{ ...sort, section: { ...sort.section, radius: 0 } }, 'invalid-radius'],
    [{ ...sort, section: { ...sort.section, goals: 0 } }, 'invalid-goals'],
    [
      { ...sort, section: { ...sort.section, source: { seed: -1, colors: ['red'] } } },
      'invalid-source',
    ],
  ])(
    'should_answer_bad_request_with_the_code_of_the_broken_field_and_save_nothing_when_a_level_breaks_a_rule_that_a_client_sees',
    async (level, problem) => {
      const token = await tokenOf('ada');

      const rejected = await update(token, { levels: [level] });
      const read = await list();

      expect(rejected.status).toBe(400);
      expect(rejected.body).toEqual(
        badRequest(`gameId "${level.gameId}", levelId "${level.levelId}": ${problem}`),
      );
      expect(read.body).toEqual({ levels: [] });
    },
  );

  // A gameId or a levelId that is not a string has no name, so its problem
  // names its place in the list, as for a string that breaks the rule.
  const GAME_ID_PROBLEM = 'levels[0]: gameId must be a lowercase slug of 1 to 64 characters, got';
  const LEVEL_ID_PROBLEM =
    'levels[0]: levelId must be a non-blank string of 1 to 64 characters with no control character.';
  it.each([
    ['gameId', 5, `${GAME_ID_PROBLEM} 5.`],
    ['gameId', null, `${GAME_ID_PROBLEM} null.`],
    ['gameId', { name: 'hexa-fit' }, `${GAME_ID_PROBLEM} {"name":"hexa-fit"}.`],
    ['levelId', 5, LEVEL_ID_PROBLEM],
    ['levelId', null, LEVEL_ID_PROBLEM],
    ['levelId', { name: 'fit-01' }, LEVEL_ID_PROBLEM],
  ])(
    'should_answer_bad_request_and_save_nothing_when_the_game_id_or_the_level_id_is_not_a_string',
    async (field, value, detail) => {
      const token = await tokenOf('ada');

      const rejected = await update(token, {
        levels: [{ ...levelJson('hexa-fit'), [field]: value }],
      });
      const read = await list();

      expect(rejected.status).toBe(400);
      expect(rejected.body).toEqual(badRequest(detail));
      expect(read.body).toEqual({ levels: [] });
    },
  );

  // #135: the update takes a gameId and a levelId through the same incoming
  // bounds as a sync: 64 characters at most, and no control character.
  it.each([
    ['gameId', 'a'.repeat(65), `${GAME_ID_PROBLEM} "${'a'.repeat(65)}".`],
    ['levelId', 'f'.repeat(65), LEVEL_ID_PROBLEM],
    ['levelId', 'fit\n01', LEVEL_ID_PROBLEM],
  ])(
    'should_answer_bad_request_and_save_nothing_when_the_game_id_or_the_level_id_breaks_an_incoming_bound',
    async (field, value, detail) => {
      const token = await tokenOf('ada');

      const rejected = await update(token, {
        levels: [{ ...levelJson('hexa-fit'), [field]: value }],
      });
      const read = await list();

      expect(rejected.status).toBe(400);
      expect(rejected.body).toEqual(badRequest(detail));
      expect(read.body).toEqual({ levels: [] });
    },
  );

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

  // A token that another key signed is no token of this API.
  it('should_answer_unauthorized_and_save_nothing_when_the_token_is_signed_with_another_secret', async () => {
    const { userId } = await signInTo(server(), 'ada');
    const foreign = new JwtService({ secret: 'another-secret' }).sign({ sub: userId });

    const rejected = await update(foreign, { levels: [levelJson('hexa-fit')] });

    expect(rejected.status).toBe(401);
    expect(rejected.body.message).toBe('Invalid or expired token');
    expect((await list()).body).toEqual({ levels: [] });
  });

  // The update checks a batch in two steps. LevelDtoMapper first checks the
  // fields and the common values of every level. Only when every level
  // passes, UpdateLevelsUseCase checks the rules of each level, A5 included.
  // So a wrong field hides the A5 problem of another level, and no level is
  // saved.
  it('should_name_only_the_level_with_an_extra_field_and_save_nothing_when_another_level_of_the_batch_fails_a5', async () => {
    const token = await tokenOf('ada');
    const extraField = { ...levelJson('hexa-fit', 'fit-02'), extra: true };

    const rejected = await update(token, {
      levels: [levelJson('hexa-sort'), extraField, a5FailingFitJson('fit-03')],
    });
    const read = await list();

    expect(rejected.status).toBe(400);
    expect(rejected.body).toEqual(
      badRequest(
        'gameId "hexa-fit", levelId "fit-02": a level holds exactly the fields gameId, levelId, order, version, topology and section',
      ),
    );
    expect(JSON.stringify(rejected.body.details)).not.toContain('fit-03');
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

    // A result needs its stored level (#135), so the update comes first.
    const updated = await update(token, { levels: [fitLevel] });
    const synced = await request(server())
      .post('/v1/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({ gameId: 'hexa-fit', results: [result] });
    const read = await list();
    const oldId = await update(token, { levels: [{ ...fitLevel, gameId: 'fit' }] });

    expect(synced.status).toBe(200);
    expect(synced.body).toMatchObject({ gameId: 'hexa-fit', results: [result] });
    expect(updated.status).toBe(204);
    expect(read.body).toEqual({ levels: [fitLevel] });
    expect(oldId.status).toBe(400);
    expect(oldId.body).toEqual(badRequest('gameId "fit", levelId "fit-01": game-without-levels'));
  });

  // #147: a stored row that no strategy accepts hides no other level. The
  // read answers 200 with the valid levels, and names the broken row in
  // unavailable, with its key and the code of its rule. The body holds no
  // stack, no SQL and no section of the row.
  it('should_answer_the_valid_levels_and_name_the_broken_row_in_unavailable_when_a_stored_row_breaks_a_rule', async () => {
    await testApp.database.db
      .insert(levels)
      .values([{ ...levelJson('hexa-fit'), section: { figure: [] } }, levelJson('hexa-sort')]);

    const read = await list();

    expect(read.status).toBe(200);
    expect(read.body).toEqual({
      levels: [levelJson('hexa-sort')],
      unavailable: [{ gameId: 'hexa-fit', levelId: 'fit-01', reason: 'invalid-figure' }],
    });
    expect(read.text).not.toMatch(/levels row|"figure"|select|\bat /);
  });

  // #147: an update of the level replaces the broken row (decision of
  // 2026-11-16 on #134). The broken row keeps a valid version, so the
  // version rule of S3-10 still runs: an equal version passes.
  it('should_answer_no_content_and_replace_the_broken_row_when_a_level_editor_sends_a_valid_level_with_its_key', async () => {
    const token = await tokenOf('ada');
    await testApp.database.db
      .insert(levels)
      .values({ ...levelJson('hexa-fit'), section: { figure: [] } });

    const updated = await update(token, { levels: [levelJson('hexa-fit')] });
    const read = await list();

    expect(updated.status).toBe(204);
    expect(read.status).toBe(200);
    expect(read.body).toEqual({ levels: [levelJson('hexa-fit')] });
  });

  // A lower version than the version column of the broken row saves nothing.
  it('should_answer_bad_request_and_keep_the_broken_row_when_the_level_is_older_than_the_broken_row', async () => {
    const token = await tokenOf('ada');
    await testApp.database.db
      .insert(levels)
      .values({ ...levelJson('hexa-fit', 'fit-01', 3), section: { figure: [] } });

    const rejected = await update(token, { levels: [levelJson('hexa-fit', 'fit-01', 2)] });
    const read = await list();

    expect(rejected.status).toBe(400);
    expect(rejected.body).toEqual(badRequest('gameId "hexa-fit", levelId "fit-01": older-version'));
    expect(read.body).toEqual({
      levels: [],
      unavailable: [{ gameId: 'hexa-fit', levelId: 'fit-01', reason: 'invalid-figure' }],
    });
  });
});

// #145: with no list of level editors, no account may update the levels.
describe('level update with no level editor configured (#145)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('should_answer_forbidden_and_save_nothing_when_no_level_editor_is_configured', async () => {
    const server = testApp.app.getHttpServer();
    const { token } = await signInTo(server, 'ada');

    const rejected = await request(server)
      .put(LEVELS_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({ levels: [levelJson('hexa-fit')] });
    const read = await request(server).get(LEVELS_PATH);

    expect(rejected.status).toBe(403);
    expect(rejected.body).toEqual(FORBIDDEN);
    expect(read.body).toEqual({ levels: [] });
  });
});
