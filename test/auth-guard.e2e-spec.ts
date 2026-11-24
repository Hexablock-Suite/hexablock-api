import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { DrizzleUserRepository } from '../src/adapters/persistence/drizzle-user-repository.js';
import { progress, users } from '../src/adapters/persistence/schema.js';
import { JwtTokenIssuer } from '../src/infrastructure/auth/jwt-token-issuer.js';
import { signIn } from './support/http/sign-in.js';
import { createTestApp, TEST_JWT_SECRET, type TestApp } from './support/http/test-app.js';
import { testUserId } from './support/user-ids.js';

// API-FR-01: a protected endpoint answers 200 with a valid token and 401
// without one. API-FR-06: every 401 has the shared ErrorDto body.
const USERNAME = 'ada';
const PASSWORD = 'correct horse battery';
const PROTECTED_PATH = '/v1/auth/me';
const FOREIGN_SECRET = 'another-secret-that-this-api-never-uses';

function unauthorizedBody(message: string) {
  return { statusCode: 401, error: 'Unauthorized', message, details: [], path: PROTECTED_PATH };
}

// A token with alg "none" and an empty signature, as an attacker can write it.
function unsignedToken(payload: object): string {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
}

describe('token guard (API-FR-01, API-FR-06)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await testApp.close();
  });

  const server = () => testApp.app.getHttpServer();
  const callProtected = (authorization?: string) => {
    const call = request(server()).get(PROTECTED_PATH);
    return authorization === undefined ? call : call.set('Authorization', authorization);
  };

  it('should_return_signed_in_user_when_token_from_login_is_sent', async () => {
    await request(server())
      .post('/v1/auth/register')
      .send({ username: USERNAME, password: PASSWORD });
    const login = await request(server())
      .post('/v1/auth/login')
      .send({ username: USERNAME, password: PASSWORD });
    const userId = new JwtService({ secret: TEST_JWT_SECRET }).decode<{ sub: string }>(
      login.body.accessToken,
    ).sub;

    const response = await callProtected(`Bearer ${login.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId });
  });

  it('should_return_lower_case_user_when_token_subject_is_an_upper_case_uuid', async () => {
    const { userId } = await signIn(server(), USERNAME);
    const upper = new JwtService({ secret: TEST_JWT_SECRET }).sign({ sub: userId.toUpperCase() });

    const response = await callProtected(`Bearer ${upper}`);

    // The UserId keeps the lower-case form that Postgres returns.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: userId.toLowerCase() });
  });

  // RFC 7235: the scheme name is case-insensitive (review comment 6683774229).
  it.each(['bearer', 'BEARER', 'BeArEr'])(
    'should_return_signed_in_user_when_scheme_name_is_not_capitalized',
    async (scheme) => {
      const { token, userId } = await signIn(server(), USERNAME);

      const response = await callProtected(`${scheme} ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ userId });
    },
  );

  // Only the scheme name ignores case. A header without the space after the
  // scheme, or with no token, still gets the missing-token error. A row
  // writes the header from the token of the signed-in user.
  it.each([
    (_token: string) => 'Bearer ',
    (token: string) => `Bearer${token}`,
    (token: string) => `Bearer\t${token}`,
  ])(
    'should_reject_as_missing_token_when_the_header_has_no_space_or_no_token_after_the_scheme',
    async (headerWith) => {
      const { token } = await signIn(server(), USERNAME);

      const response = await callProtected(headerWith(token));

      expect(response.status).toBe(401);
      expect(response.body).toEqual(unauthorizedBody('Missing bearer token'));
    },
  );

  it('should_return_unauthorized_error_body_when_token_is_missing', async () => {
    const response = await callProtected();

    expect(response.status).toBe(401);
    expect(response.body).toEqual(unauthorizedBody('Missing bearer token'));
  });

  it('should_return_unauthorized_error_body_when_header_is_not_bearer', async () => {
    const response = await callProtected('Basic YWRhOnNlY3JldA==');

    expect(response.status).toBe(401);
    expect(response.body).toEqual(unauthorizedBody('Missing bearer token'));
  });

  it('should_return_unauthorized_error_body_when_token_is_malformed', async () => {
    const response = await callProtected('Bearer not-a-jwt');

    expect(response.status).toBe(401);
    expect(response.body).toEqual(unauthorizedBody('Invalid or expired token'));
  });

  it('should_return_unauthorized_error_body_when_token_is_expired', async () => {
    const expired = new JwtService({ secret: TEST_JWT_SECRET }).sign({
      sub: testUserId(1),
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    const response = await callProtected(`Bearer ${expired}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(unauthorizedBody('Invalid or expired token'));
  });

  it('should_return_unauthorized_error_body_when_token_has_foreign_signature', async () => {
    const foreign = new JwtService({ secret: FOREIGN_SECRET }).sign({ sub: testUserId(1) });

    const response = await callProtected(`Bearer ${foreign}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(unauthorizedBody('Invalid or expired token'));
  });

  // A UserId is a UUID (#64). A valid signature over another sub is still a
  // bad token: it gets the same 401 and never reaches a repository.
  it('should_return_unauthorized_error_body_when_token_subject_is_not_a_uuid', async () => {
    const notUuid = new JwtService({ secret: TEST_JWT_SECRET }).sign({ sub: 'not-a-uuid' });

    const me = await callProtected(`Bearer ${notUuid}`);
    const sync = await request(server())
      .post('/v1/progress')
      .set('Authorization', `Bearer ${notUuid}`)
      .send({ gameId: 'hexa-lines', score: 120 });

    expect(me.status).toBe(401);
    expect(me.body).toEqual(unauthorizedBody('Invalid or expired token'));
    expect(sync.status).toBe(401);
    expect(sync.body).toEqual({
      ...unauthorizedBody('Invalid or expired token'),
      path: '/v1/progress',
    });
    expect(await testApp.database.db.select().from(users)).toHaveLength(0);
    expect(await testApp.database.db.select().from(progress)).toHaveLength(0);
  });

  // A valid token whose user has no stored row is a bad token (#137,
  // decision of 2026-11-17). AuthenticateTokenUseCase looks the user up, so
  // every guarded route gets the same 401, and the sync stores nothing.
  it('should_return_unauthorized_error_body_and_store_nothing_when_user_is_deleted_after_sign_in', async () => {
    const { token } = await signIn(server(), USERNAME);
    await testApp.database.db.delete(users);

    const me = await callProtected(`Bearer ${token}`);
    const sync = await request(server())
      .post('/v1/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({ gameId: 'hexa-lines', score: 10 });

    expect(me.status).toBe(401);
    expect(me.body).toEqual(unauthorizedBody('Invalid or expired token'));
    expect(sync.status).toBe(401);
    expect(sync.body).toEqual({
      ...unauthorizedBody('Invalid or expired token'),
      path: '/v1/progress',
    });
    expect(await testApp.database.db.select().from(users)).toHaveLength(0);
    expect(await testApp.database.db.select().from(progress)).toHaveLength(0);
  });

  it('should_return_unauthorized_error_body_and_store_nothing_when_token_subject_never_existed', async () => {
    await signIn(server(), USERNAME);
    const stranger = new JwtService({ secret: TEST_JWT_SECRET }).sign({ sub: randomUUID() });

    const me = await callProtected(`Bearer ${stranger}`);
    const sync = await request(server())
      .post('/v1/progress')
      .set('Authorization', `Bearer ${stranger}`)
      .send({ gameId: 'hexa-lines', score: 10 });

    expect(me.status).toBe(401);
    expect(me.body).toEqual(unauthorizedBody('Invalid or expired token'));
    expect(sync.status).toBe(401);
    expect(sync.body).toEqual({
      ...unauthorizedBody('Invalid or expired token'),
      path: '/v1/progress',
    });
    expect(await testApp.database.db.select().from(users)).toHaveLength(1);
    expect(await testApp.database.db.select().from(progress)).toHaveLength(0);
  });

  // The user can go between the check of the guard and the write. The
  // stand-in check lets the request pass the guard, so the foreign key of
  // progress.user_id rejects the write. The repository names the failure,
  // and the answer is the 401 of a bad token, not a 500 (#137).
  it('should_return_unauthorized_error_body_and_store_nothing_when_user_goes_after_the_guard', async () => {
    const stranger = new JwtService({ secret: TEST_JWT_SECRET }).sign({ sub: randomUUID() });
    vi.spyOn(DrizzleUserRepository.prototype, 'exists').mockResolvedValue(true);

    const sync = await request(server())
      .post('/v1/progress')
      .set('Authorization', `Bearer ${stranger}`)
      .send({ gameId: 'hexa-lines', score: 10 });

    expect(sync.status).toBe(401);
    expect(sync.body).toEqual({
      ...unauthorizedBody('Invalid or expired token'),
      path: '/v1/progress',
    });
    expect(await testApp.database.db.select().from(progress)).toHaveLength(0);
  });

  it('should_return_unauthorized_error_body_when_token_has_alg_none', async () => {
    const { userId } = await signIn(server(), USERNAME);

    const response = await callProtected(`Bearer ${unsignedToken({ sub: userId })}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(unauthorizedBody('Invalid or expired token'));
  });

  it('should_return_internal_error_body_when_token_check_throws', async () => {
    const { token } = await signIn(server(), USERNAME);
    vi.spyOn(JwtTokenIssuer.prototype, 'verify').mockImplementation(() => {
      throw new Error('key store is unreachable');
    });

    const response = await callProtected(`Bearer ${token}`);

    // A failure of the token check is not a rejected token, so it is no 401.
    // HttpErrorFilter hides its message behind a 500.
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      details: [],
      path: PROTECTED_PATH,
    });
  });
});
