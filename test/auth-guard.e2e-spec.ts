import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
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

describe('token guard (API-FR-01, API-FR-06)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
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
});
