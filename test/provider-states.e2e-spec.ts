import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/infrastructure/app.module.js';
import { configureHttpApp } from '../src/infrastructure/http-app.js';
import { createProviderApp, type ProviderApp } from './support/contract/provider-app.js';
import { signIn, TEST_PASSWORD } from './support/http/sign-in.js';
import { stubTestEnvironment } from './support/http/test-app.js';

// #151: the pact provider states of the client interactions of app #45 to
// #48, and #258: those of app #480 and #485. Only the test composition of
// the contract job mounts the state-change endpoint. Each setup adds rows
// through the public routes, the level store or the database; each teardown
// removes every row, so the next interaction starts on an empty database.
const ROOT = resolve(import.meta.dirname, '..');
const STATES = '/v1/_pact/provider-states';
const LOCAL_PACT = 'test/fixtures/contract/provider-states.json';
const run = promisify(execFile);

describe('pact provider states (#151)', () => {
  // The production composition: AppModule as main.ts starts it. No route of
  // it reaches a database here, so the unused pool never connects.
  it('should_answer_404_when_the_production_app_module_receives_a_provider_state_change', async () => {
    stubTestEnvironment();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    configureHttpApp(app);
    await app.init();

    const response = await request(app.getHttpServer())
      .post(STATES)
      .send({ state: 'a signed-in account exists', action: 'setup' });

    expect(response.status).toBe(404);
    await app.close();
    vi.unstubAllEnvs();
  });

  // #170: the provider composition turns the rate limit of sign-up and
  // sign-in off, whatever AUTH_RATE_LIMIT holds, because the contract job
  // signs in for each provider state. The app CI starts it too.
  it('should_answer_no_429_when_the_provider_composition_signs_in_more_times_than_auth_rate_limit', async () => {
    stubTestEnvironment();
    vi.stubEnv('AUTH_RATE_LIMIT', '1');
    const composition = await createProviderApp();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(composition.app.getHttpServer())
        .post('/v1/auth/login')
        .send({ username: 'ada', password: TEST_PASSWORD });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([401, 401, 401]);
    await composition.close();
    vi.unstubAllEnvs();
  });

  describe('the test composition', () => {
    let provider: ProviderApp;

    beforeEach(async () => {
      stubTestEnvironment();
      provider = await createProviderApp();
    });

    afterEach(async () => {
      await provider.close();
      vi.unstubAllEnvs();
    });

    const server = () => provider.app.getHttpServer();
    const setUp = (state: string, params?: object) =>
      request(server()).post(STATES).send({ state, params, action: 'setup' });
    const tearDown = (state: string) =>
      request(server()).post(STATES).send({ state, action: 'teardown' });
    const login = (username: string, password = TEST_PASSWORD) =>
      request(server()).post('/v1/auth/login').send({ username, password });
    const withToken = (path: string, token: unknown) =>
      request(server())
        .get(path)
        .set('Authorization', `Bearer ${String(token)}`);

    it('should_answer_200_with_no_values_when_an_interaction_has_no_state', async () => {
      const setup = await setUp('');

      expect(setup.status).toBe(200);
      expect(setup.body).toEqual({});
    });

    it('should_let_the_username_sign_up_when_no_account_exists_is_set_up', async () => {
      const setup = await setUp('no account exists');
      const signUp = await request(server())
        .post('/v1/auth/register')
        .send({ username: 'ada', password: TEST_PASSWORD });

      expect(setup.status).toBe(200);
      expect(setup.body).toEqual({});
      expect(signUp.status).toBe(201);
    });

    it('should_accept_the_credentials_and_refuse_the_username_when_an_account_exists_is_set_up', async () => {
      const setup = await setUp('an account exists', {
        username: 'grace',
        password: 'pa55word-long',
      });
      const signIn = await login('grace', 'pa55word-long');
      const signUp = await request(server())
        .post('/v1/auth/register')
        .send({ username: 'grace', password: TEST_PASSWORD });

      expect(setup.status).toBe(200);
      expect(setup.body).toEqual({ username: 'grace' });
      expect(signIn.status).toBe(200);
      expect(signUp.status).toBe(409);
    });

    it('should_return_a_token_of_the_account_when_a_signed_in_account_exists_is_set_up', async () => {
      const setup = await setUp('a signed-in account exists');
      const me = await withToken('/v1/auth/me', setup.body.accessToken);

      expect(setup.status).toBe(200);
      expect(setup.body).toEqual({
        accessToken: expect.any(String),
        userId: expect.any(String),
        username: 'ada',
      });
      expect(me.status).toBe(200);
      expect(me.body).toEqual({ userId: setup.body.userId });
    });

    it('should_list_the_level_when_a_level_is_stored_is_set_up', async () => {
      const setup = await setUp('a level is stored', { gameId: 'hexa-sort', levelId: 'sort-07' });
      const levels = await request(server()).get('/v1/levels');

      expect(setup.status).toBe(200);
      expect(setup.body).toEqual({ gameId: 'hexa-sort', levelId: 'sort-07' });
      expect(levels.status).toBe(200);
      expect(
        levels.body.levels.map((level: { gameId: string; levelId: string }) => [
          level.gameId,
          level.levelId,
        ]),
      ).toEqual([['hexa-sort', 'sort-07']]);
    });

    it('should_serve_the_synced_result_when_the_signed_in_account_has_progress_on_a_stored_level_is_set_up', async () => {
      const setup = await setUp('the signed-in account has progress on a stored level');
      const progress = await withToken('/v1/progress/hexa-fit', setup.body.accessToken);

      expect(setup.status).toBe(200);
      expect(setup.body).toEqual({
        accessToken: expect.any(String),
        userId: expect.any(String),
        username: 'ada',
        gameId: 'hexa-fit',
        levelId: 'fit-01',
      });
      expect(progress.status).toBe(200);
      expect(progress.body.results).toEqual([
        { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 },
      ]);
    });

    it('should_rank_three_accounts_when_several_accounts_have_results_on_a_stored_level_is_set_up', async () => {
      const setup = await setUp('several accounts have results on a stored level', {
        levelId: 'fit-02',
      });
      const board = await withToken(
        '/v1/leaderboard/hexa-fit/levels/fit-02',
        setup.body.accessToken,
      );

      expect(setup.status).toBe(200);
      expect(setup.body).toEqual({
        accessToken: expect.any(String),
        gameId: 'hexa-fit',
        levelId: 'fit-02',
      });
      expect(board.status).toBe(200);
      expect(
        board.body.entries.map((entry: { rank: number; moves: number }) => [
          entry.rank,
          entry.moves,
        ]),
      ).toEqual([
        [1, 10],
        [2, 12],
        [3, 14],
      ]);
    });

    // #258: the global board of app #480. Each account syncs one score and
    // no level result, so the board has high-score rows and no standing.
    it('should_rank_three_high_scores_when_several_accounts_have_high_scores_in_a_game_is_set_up', async () => {
      const setup = await setUp('several accounts have high scores in a game', {
        gameId: 'hexa-merge',
      });
      const board = await withToken('/v1/leaderboard/hexa-merge', setup.body.accessToken);

      expect(setup.status).toBe(200);
      expect(setup.body).toEqual({ accessToken: expect.any(String), gameId: 'hexa-merge' });
      expect(board.status).toBe(200);
      expect(
        board.body.highScores.map((row: { rank: number; username: string; highScore: number }) => [
          row.rank,
          row.username,
          row.highScore,
        ]),
      ).toEqual([
        [1, 'ada', 300],
        [2, 'grace', 200],
        [3, 'linus', 100],
      ]);
      expect(board.body.standings).toEqual([]);
    });

    // #258: the unavailable list of app #485. The broken row hides no
    // other level, so the list of valid levels stays empty.
    it('should_name_the_level_in_unavailable_when_a_broken_level_is_stored_is_set_up', async () => {
      const setup = await setUp('a broken level is stored', { levelId: 'fit-03' });
      const levels = await request(server()).get('/v1/levels');

      expect(setup.status).toBe(200);
      expect(setup.body).toEqual({
        gameId: 'hexa-fit',
        levelId: 'fit-03',
        reason: 'invalid-figure',
      });
      expect(levels.status).toBe(200);
      expect(levels.body).toEqual({
        levels: [],
        unavailable: [{ gameId: 'hexa-fit', levelId: 'fit-03', reason: 'invalid-figure' }],
      });
    });

    // Two states of one interaction add up: the account syncs a result on
    // the level of the other state.
    it('should_keep_the_rows_of_each_state_when_one_interaction_sets_up_two_states', async () => {
      await setUp('a level is stored');
      const account = await setUp('a signed-in account exists');
      const sync = await request(server())
        .post('/v1/progress')
        .set('Authorization', `Bearer ${String(account.body.accessToken)}`)
        .send({
          gameId: 'hexa-fit',
          results: [{ levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 }],
        });

      expect(sync.status).toBe(200);
    });

    it('should_remove_every_row_when_a_state_is_torn_down', async () => {
      await setUp('several accounts have results on a stored level');

      const teardown = await tearDown('several accounts have results on a stored level');
      const signIn = await login('ada');
      const levels = await request(server()).get('/v1/levels');

      expect(teardown.status).toBe(200);
      expect(teardown.body).toEqual({});
      expect(signIn.status).toBe(401);
      expect(levels.body).toEqual({ levels: [] });
    });

    // #258: the teardown removes the broken row and the high scores too.
    it('should_remove_the_broken_row_and_the_high_scores_when_the_states_of_258_are_torn_down', async () => {
      await setUp('a broken level is stored');
      await setUp('several accounts have high scores in a game');

      const teardown = await tearDown('several accounts have high scores in a game');
      const signInAda = await login('ada');
      const levels = await request(server()).get('/v1/levels');
      const { token } = await signIn(server(), 'eve');
      const board = await withToken('/v1/leaderboard/hexa-lines', token);

      expect(teardown.status).toBe(200);
      expect(signInAda.status).toBe(401);
      expect(levels.body).toEqual({ levels: [] });
      expect(board.body.highScores).toEqual([]);
    });

    it('should_answer_400_and_name_the_known_states_when_the_state_is_unknown', async () => {
      const setup = await setUp('a dragon exists');

      expect(setup.status).toBe(400);
      expect(setup.body.message).toBe(
        'Unknown provider state "a dragon exists". Known states: no account exists, an account exists, a signed-in account exists, a level is stored, the signed-in account has progress on a stored level, several accounts have results on a stored level, several accounts have high scores in a game, a broken level is stored.',
      );
    });

    it('should_answer_400_and_store_no_account_when_a_state_parameter_is_not_text', async () => {
      const setup = await setUp('an account exists', { username: 42 });
      const signIn = await login('ada');

      expect(setup.status).toBe(400);
      expect(setup.body.message).toBe('The provider state parameter username must be text.');
      expect(signIn.status).toBe(401);
    });

    // The verifier of the contract job, with the local pact that names each
    // state. The verifier waits on this process, so the call must not block.
    it('should_pass_every_interaction_when_verify_provider_runs_the_local_pact_of_the_states', async () => {
      await provider.app.listen(0, '127.0.0.1');
      const { port } = new URL(await provider.app.getUrl());

      const verification = await run(process.execPath, ['scripts/contract/verify-provider.js'], {
        cwd: ROOT,
        env: {
          PATH: process.env.PATH ?? '',
          BACKEND_URL: `http://127.0.0.1:${port}`,
          PACT_FILE: LOCAL_PACT,
          PACT_DO_NOT_TRACK: 'true',
        },
      });

      expect(verification.stdout).toContain(`Verifying ${resolve(ROOT, LOCAL_PACT)}`);
      expect(verification.stdout).not.toContain('Failures:');
    }, 60_000);
  });

  // Both contract jobs, the one of this repository and the one of the app,
  // start the API with this command. It runs the test composition from the
  // sources with the example configuration.
  it('should_serve_the_provider_states_when_start_provider_starts_the_test_composition', async () => {
    const port = await freePort();
    const child = spawn(
      process.execPath,
      ['--env-file=.env.example', 'scripts/contract/start-provider.js'],
      { cwd: ROOT, env: { PATH: process.env.PATH ?? '', PORT: String(port) }, stdio: 'ignore' },
    );
    try {
      const base = `http://127.0.0.1:${port}`;
      await waitForHealth(base, child);

      const setup = await fetch(`${base}${STATES}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'a signed-in account exists', action: 'setup' }),
      });
      const values = (await setup.json()) as { accessToken: string };
      const me = await fetch(`${base}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${values.accessToken}` },
      });

      expect(setup.status).toBe(200);
      expect(me.status).toBe(200);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, 'exit');
        child.kill('SIGTERM');
        await exit;
      }
    }
  }, 60_000);
});

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((done) => probe.close(() => done()));
  return port;
}

// Asks /v1/health once each 250 ms, for at most 30 s.
async function waitForHealth(base: string, child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`start-provider.js ended with exit code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(`${base}/v1/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // The server does not listen yet.
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error('start-provider.js did not answer /v1/health in 30 s.');
}
