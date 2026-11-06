import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { users } from '../src/adapters/persistence/schema.js';
import { createTestApp, TEST_JWT_SECRET, type TestApp } from './support/http/test-app.js';

// API-FR-01: sign-up and sign-in with JWT. API-FR-06: errors use ErrorDto.
const USERNAME = 'ada';
const PASSWORD = 'correct horse battery';

describe('auth endpoints (API-FR-01)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  const post = (path: string, body: object) =>
    request(testApp.app.getHttpServer()).post(path).send(body);

  it('should_store_password_hash_when_user_registers', async () => {
    const response = await post('/auth/register', { username: USERNAME, password: PASSWORD });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({});
    const rows = await testApp.database.db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe(USERNAME);
    expect(rows[0].passwordHash).not.toContain(PASSWORD);
    expect(rows[0].passwordHash).toMatch(/^scrypt\$/);
  });

  it('should_return_conflict_error_body_when_username_is_taken', async () => {
    await post('/auth/register', { username: USERNAME, password: PASSWORD });

    const response = await post('/auth/register', {
      username: USERNAME,
      password: 'other password',
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Username is already taken',
      details: [],
      path: '/auth/register',
    });
    expect(await testApp.database.db.select().from(users)).toHaveLength(1);
  });

  it('should_return_validation_error_body_when_credentials_break_the_rules', async () => {
    const response = await post('/auth/register', { username: 'a!', password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: [
        'username must have 3 to 32 characters: letters, digits, dots, hyphens or underscores',
        'password must have 8 to 128 characters',
      ],
      path: '/auth/register',
    });
    expect(await testApp.database.db.select().from(users)).toHaveLength(0);
  });

  it('should_return_validation_error_body_when_credentials_are_missing', async () => {
    const response = await post('/auth/register', { username: 7 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: ['username must be a string', 'password must be a string'],
      path: '/auth/register',
    });
    expect(await testApp.database.db.select().from(users)).toHaveLength(0);
  });

  it('should_return_jwt_for_user_when_credentials_are_valid', async () => {
    await post('/auth/register', { username: USERNAME, password: PASSWORD });
    const [stored] = await testApp.database.db.select().from(users);

    const response = await post('/auth/login', { username: USERNAME, password: PASSWORD });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(['accessToken']);
    const payload = new JwtService({ secret: TEST_JWT_SECRET }).verify<{ sub: string }>(
      response.body.accessToken,
    );
    expect(payload.sub).toBe(stored.id);
  });

  it('should_return_unauthorized_error_body_when_password_is_wrong', async () => {
    await post('/auth/register', { username: USERNAME, password: PASSWORD });

    const response = await post('/auth/login', { username: USERNAME, password: 'wrong password' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid username or password',
      details: [],
      path: '/auth/login',
    });
  });

  it('should_return_unauthorized_error_body_when_username_is_unknown', async () => {
    const response = await post('/auth/login', { username: 'nobody', password: PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid username or password',
      details: [],
      path: '/auth/login',
    });
  });

  it('should_return_validation_error_body_when_login_body_is_missing_fields', async () => {
    const response = await post('/auth/login', {});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: ['username must be a string', 'password must be a string'],
      path: '/auth/login',
    });
  });
});
