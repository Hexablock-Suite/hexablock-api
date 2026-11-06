import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { users } from '../src/adapters/persistence/schema.js';
import { JwtTokenIssuer } from '../src/infrastructure/auth/jwt-token-issuer.js';
import { signIn } from './support/http/sign-in.js';
import { createTestApp, TEST_JWT_SECRET, type TestApp } from './support/http/test-app.js';

// API-FR-01: a protected endpoint answers 200 with a valid token and 401
// without one. API-FR-06: every 401 has the shared ErrorDto body.
const USERNAME = 'ada';
const PASSWORD = 'correct horse battery';
const PROTECTED_PATH = '/auth/me';
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
    await request(server()).post('/auth/register').send({ username: USERNAME, password: PASSWORD });
    const login = await request(server())
      .post('/auth/login')
      .send({ username: USERNAME, password: PASSWORD });
    const userId = new JwtService({ secret: TEST_JWT_SECRET }).decode<{ sub: string }>(
      login.body.accessToken,
    ).sub;

    const response = await callProtected(`Bearer ${login.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId });
  });

  it('should_return_signed_in_user_when_scheme_name_is_not_capitalized', async () => {
    const { token, userId } = await signIn(server(), USERNAME);
    // RFC 7235: the scheme name is case-insensitive (review comment 6683774229).
    for (const scheme of ['bearer', 'BEARER']) {
      const response = await callProtected(`${scheme} ${token}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ userId });
    }
  });

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
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    const response = await callProtected(`Bearer ${expired}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(unauthorizedBody('Invalid or expired token'));
  });

  it('should_return_unauthorized_error_body_when_token_has_foreign_signature', async () => {
    const foreign = new JwtService({ secret: FOREIGN_SECRET }).sign({ sub: 'user-1' });

    const response = await callProtected(`Bearer ${foreign}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(unauthorizedBody('Invalid or expired token'));
  });

  it('should_return_signed_in_user_when_user_is_deleted_after_sign_in', async () => {
    const { token, userId } = await signIn(server(), USERNAME);
    await testApp.database.db.delete(users);

    const response = await callProtected(`Bearer ${token}`);

    // The guard reads only the token. It does not look the user up
    // (flows.md, row AuthenticateTokenUseCase; body of PR #41).
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId });
    expect(await testApp.database.db.select().from(users)).toHaveLength(0);
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
