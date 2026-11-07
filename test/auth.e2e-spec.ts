import { JwtService } from '@nestjs/jwt';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { users } from '../src/adapters/persistence/schema.js';
import { createTestApp, TEST_JWT_SECRET, type TestApp } from './support/http/test-app.js';

// API-FR-01: sign-up and sign-in with JWT. API-FR-06: errors use ErrorDto.
const USERNAME = 'ada';
const PASSWORD = 'correct horse battery';
const MISSING_FIELDS = ['username must be a string', 'password must be a string'];

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

  // Four emoji are 8 UTF-16 units but 4 code points (#60).
  it('should_return_validation_error_body_when_password_has_four_emoji', async () => {
    const response = await post('/auth/register', {
      username: USERNAME,
      password: '\u{1F600}'.repeat(4),
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: ['password must have 8 to 128 characters'],
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

  it('should_return_unauthorized_error_body_when_login_password_has_more_than_128_characters', async () => {
    await post('/auth/register', { username: USERNAME, password: PASSWORD });

    const response = await post('/auth/login', { username: USERNAME, password: 'x'.repeat(129) });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid username or password',
      details: [],
      path: '/auth/login',
    });
  });

  // Login answers 401, never 400, so its schema publishes no length rule (#60).
  it('should_publish_login_body_without_length_rules_when_openapi_document_is_requested', async () => {
    const response = await request(testApp.app.getHttpServer()).get('/docs-json');

    const { paths, components } = response.body;
    const bodyOf = (path: string) => paths[path].post.requestBody.content['application/json'];
    expect(bodyOf('/auth/login').schema).toEqual({ $ref: '#/components/schemas/LoginDto' });
    expect(bodyOf('/auth/register').schema).toEqual({
      $ref: '#/components/schemas/CredentialsDto',
    });
    const login = components.schemas.LoginDto;
    expect(login.required).toEqual(['username', 'password']);
    for (const property of Object.values<object>(login.properties)) {
      expect(property).toMatchObject({ type: 'string' });
      expect(property).not.toHaveProperty('minLength');
      expect(property).not.toHaveProperty('maxLength');
      expect(property).not.toHaveProperty('pattern');
    }
    expect(components.schemas.CredentialsDto.properties).toMatchObject({
      username: { minLength: 3, maxLength: 32, pattern: '^[A-Za-z0-9._-]{3,32}$' },
      password: { minLength: 8, maxLength: 128 },
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

  it('should_create_two_accounts_when_usernames_differ_only_in_case', async () => {
    // The username rule is case-sensitive (proposal in the body of PR #40).
    const upper = await post('/auth/register', { username: 'Ada', password: PASSWORD });
    const lower = await post('/auth/register', { username: 'ada', password: PASSWORD });

    expect(upper.status).toBe(201);
    expect(lower.status).toBe(201);
    const rows = await testApp.database.db.select().from(users);
    expect(rows.map((row) => row.username).sort()).toEqual(['Ada', 'ada']);
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  it('should_return_validation_error_body_when_body_is_not_a_json_object', async () => {
    const server = testApp.app.getHttpServer();
    for (const path of ['/auth/register', '/auth/login']) {
      const responses = [
        await request(server).post(path).send([]),
        await request(server).post(path).set('Content-Type', 'text/plain').send('ada'),
      ];

      for (const response of responses) {
        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Request validation failed',
          details: MISSING_FIELDS,
          path,
        });
      }
    }
    expect(await testApp.database.db.select().from(users)).toHaveLength(0);
  });

  it('should_return_bad_request_error_body_when_json_body_is_null', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/register')
      .set('Content-Type', 'application/json')
      .send('null');

    // The JSON parser rejects a body that is not an object or an array. Its
    // message comes from the JavaScript engine, so the test does not pin it.
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: expect.any(String),
      details: [],
      path: '/auth/register',
    });
    expect(await testApp.database.db.select().from(users)).toHaveLength(0);
  });

  it('should_hide_database_error_when_storing_the_user_fails', async () => {
    // A check constraint makes every insert fail with a code other than
    // unique_violation, as a broken database does.
    await testApp.database.db.execute(
      sql`alter table users add constraint users_reject_all check (false) not valid`,
    );

    const response = await post('/auth/register', { username: USERNAME, password: PASSWORD });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      details: [],
      path: '/auth/register',
    });
    expect(await testApp.database.db.select().from(users)).toHaveLength(0);
  });
});
