import { BadRequestException } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { levels as levelRows } from '../../../src/adapters/persistence/schema.js';
import type { LevelRepository } from '../../../src/application/ports/level-repository.js';
import { signIn, TEST_PASSWORD } from '../http/sign-in.js';
import { levelJson } from '../level-format.js';
import { brokenRow, storeLevel } from '../level-repository.contract.js';
import type { TestDatabase } from '../test-database.js';

// What a state setup may use: the HTTP server of the provider, its level
// store and its database. The routes have no level upload for a test
// account, so a level goes straight to the store. The store refuses a broken
// level, so a broken row goes straight to the database.
export interface StateContext {
  readonly server: App;
  readonly levels: LevelRepository;
  readonly database: TestDatabase;
}

// The params of a state, as the pact gives them. Each param is optional.
export type StateParams = Readonly<Record<string, unknown>>;

// The values of a setup. The verifier puts them into the request of the
// interaction through a provider-state expression, such as
// "Bearer ${accessToken}".
export type StateValues = Readonly<Record<string, unknown>>;

type StateSetup = (context: StateContext, params: StateParams) => Promise<StateValues>;

const DEFAULT_USERNAME = 'ada';
const DEFAULT_GAME = 'hexa-fit';
const DEFAULT_LEVEL = 'fit-01';
const DEFAULT_SCORE_GAME = 'hexa-lines';
// The players of the board state, with the moves of each result. Fewer
// moves rank first, so ada ranks first (DS-4).
const BOARD_PLAYERS = [
  ['ada', 10],
  ['grace', 12],
  ['linus', 14],
] as const;
// The players of the high-score state, with the score of each. The highest
// score ranks first, so ada ranks first.
const SCORE_PLAYERS = [
  ['ada', 300],
  ['grace', 200],
  ['linus', 100],
] as const;

// One handler per state name that the client pact uses (app #45 to #48,
// #480 and #485).
// Each setup adds rows; the teardown of the endpoint removes them. So two
// states of one interaction add up.
export const PROVIDER_STATES: Readonly<Record<string, StateSetup>> = {
  // App #45: a sign-up with a free username.
  'no account exists': () => Promise.resolve({}),
  // App #45: a sign-in, and a sign-up with a taken username.
  'an account exists': async ({ server }, params) => {
    const username = textParam(params, 'username', DEFAULT_USERNAME);
    const password = textParam(params, 'password', TEST_PASSWORD);
    const signUp = await request(server).post('/v1/auth/register').send({ username, password });
    expectStatus('an account exists', signUp.status, 201);
    return { username };
  },
  // App #45, #46 and #47: a request with a bearer token.
  'a signed-in account exists': async ({ server }, params) => ({
    ...(await signedIn(server, params)),
  }),
  // App #48: the stored levels. App #46: a level of a synced result.
  'a level is stored': async ({ levels }, params) => {
    const level = await storedLevel(levels, params);
    return { ...level };
  },
  // App #46: the read of a stored progress.
  'the signed-in account has progress on a stored level': async ({ server, levels }, params) => {
    const level = await storedLevel(levels, params);
    const account = await signedIn(server, params);
    await sync(server, account.accessToken, level, 12);
    return { ...account, ...level };
  },
  // App #47: the global board and the board of a level. The token belongs
  // to the first player.
  'several accounts have results on a stored level': async ({ server, levels }, params) => {
    const level = await storedLevel(levels, params);
    const tokens = await Promise.all(
      BOARD_PLAYERS.map(async ([username, moves]) => {
        const account = await signedIn(server, { username });
        await sync(server, account.accessToken, level, moves);
        return account.accessToken;
      }),
    );
    return { accessToken: tokens[0], ...level };
  },
  // App #480: the high scores of the global board. Each player syncs one
  // score and no level result. The token belongs to the first player.
  'several accounts have high scores in a game': async ({ server }, params) => {
    const gameId = textParam(params, 'gameId', DEFAULT_SCORE_GAME);
    const tokens = await Promise.all(
      SCORE_PLAYERS.map(async ([username, score]) => {
        const account = await signedIn(server, { username });
        await syncScore(server, account.accessToken, gameId, score);
        return account.accessToken;
      }),
    );
    return { accessToken: tokens[0], gameId };
  },
  // App #485: the unavailable list of the stored levels. The row has a Fit
  // section that breaks its rule. The reason is the code that the store
  // reads from the row.
  'a broken level is stored': async ({ levels, database }, params) => {
    const { gameId, levelId } = levelKey(params);
    await database.db.insert(levelRows).values(brokenRow(levelJson(gameId, levelId)));
    const listed = await levels.list();
    const broken = listed.unavailable.find(
      (level) => level.gameId === gameId && level.levelId === levelId,
    );
    if (broken === undefined) {
      throw new BadRequestException(`The level ${gameId}/${levelId} is not unavailable.`);
    }
    return { gameId, levelId, reason: broken.reason };
  },
};

interface SignedIn {
  readonly accessToken: string;
  readonly userId: string;
  readonly username: string;
}

interface StoredLevel {
  readonly gameId: 'hexa-fit' | 'hexa-sort';
  readonly levelId: string;
}

async function signedIn(server: App, params: StateParams): Promise<SignedIn> {
  const username = textParam(params, 'username', DEFAULT_USERNAME);
  const password = textParam(params, 'password', TEST_PASSWORD);
  const { token, userId } = await signIn(server, username, password);
  return { accessToken: token, userId, username };
}

// The gameId and the levelId of a level of the format.
function levelKey(params: StateParams): StoredLevel {
  const gameId = textParam(params, 'gameId', DEFAULT_GAME);
  if (gameId !== 'hexa-fit' && gameId !== 'hexa-sort') {
    throw new BadRequestException(
      'The provider state parameter gameId must be hexa-fit or hexa-sort.',
    );
  }
  const levelId = textParam(params, 'levelId', DEFAULT_LEVEL);
  return { gameId, levelId };
}

// Stores the example level of the format under the given gameId and levelId.
async function storedLevel(levels: LevelRepository, params: StateParams): Promise<StoredLevel> {
  const { gameId, levelId } = levelKey(params);
  const stored = await storeLevel(levels, levelJson(gameId, levelId));
  if (!stored.ok) {
    throw new BadRequestException(`The level ${gameId}/${levelId} was not stored.`);
  }
  return { gameId, levelId };
}

// Syncs one result with three stars on the level.
async function sync(server: App, token: string, level: StoredLevel, moves: number): Promise<void> {
  const response = await request(server)
    .post('/v1/progress')
    .set('Authorization', `Bearer ${token}`)
    .send({
      gameId: level.gameId,
      results: [{ levelId: level.levelId, stars: 3, moves, elapsedMs: 45000 }],
    });
  expectStatus('the sync of a result', response.status, 200);
}

// Syncs one score of the game and no level result.
async function syncScore(server: App, token: string, gameId: string, score: number): Promise<void> {
  const response = await request(server)
    .post('/v1/progress')
    .set('Authorization', `Bearer ${token}`)
    .send({ gameId, score });
  expectStatus('the sync of a score', response.status, 200);
}

function textParam(params: StateParams, name: string, fallback: string): string {
  const value = params[name] ?? fallback;
  if (typeof value !== 'string') {
    throw new BadRequestException(`The provider state parameter ${name} must be text.`);
  }
  return value;
}

function expectStatus(step: string, actual: number, expected: number): void {
  if (actual !== expected) {
    throw new BadRequestException(`${step} answered ${actual}, not ${expected}.`);
  }
}
