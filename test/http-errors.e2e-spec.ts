import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { ErrorProbeController } from './support/http/error-probe.controller.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';

// API-FR-06: every HTTP error has the same body shape.
const ERROR_BODY_KEYS = ['details', 'error', 'message', 'path', 'statusCode'];

describe('HTTP error body (API-FR-06)', () => {
  let testApp: TestApp;
  let app: INestApplication<App>;

  beforeEach(async () => {
    testApp = await createTestApp([ErrorProbeController]);
    app = testApp.app;
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('should_return_error_body_when_resource_does_not_exist', async () => {
    const response = await request(app.getHttpServer()).get('/v1/no-such-resource');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot GET /v1/no-such-resource',
      details: [],
      path: '/v1/no-such-resource',
    });
  });

  // The query can hold a secret, such as a token, and a client can log the
  // error body. So path ends at the first «?» (RFC 3986 §3.3, gap G2.4).
  it('should_return_path_without_query_when_url_has_a_query', async () => {
    const server = app.getHttpServer();

    const probe = await request(server).get('/v1/error-probe/items/abc?token=secret-value');
    const unknown = await request(server).get('/v1/no-such-resource?token=secret-value?next=1');

    expect(probe.status).toBe(400);
    expect(probe.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed (numeric string is expected)',
      details: [],
      path: '/v1/error-probe/items/abc',
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body.path).toBe('/v1/no-such-resource');
  });

  // Nest answers an unknown route with «Cannot GET <url>». That url holds the
  // query, so the filter removes the query from the message too.
  it('should_return_no_query_in_the_error_body_when_the_route_is_unknown', async () => {
    const response = await request(app.getHttpServer()).get(
      '/v1/no-such-resource?token=secret-value',
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot GET /v1/no-such-resource',
      details: [],
      path: '/v1/no-such-resource',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-value');
    expect(JSON.stringify(response.body)).not.toContain('?');
  });

  // The message names the method, and a query can start with a second «?» or
  // hold encoded characters. The body holds no part of the query in each case.
  // Each request is one case (#184).
  it.each([
    { method: 'post', url: '/v1/no-such-resource?token=secret-value' },
    { method: 'delete', url: '/v1/no-such-resource?token=secret-value' },
    { method: 'get', url: '/v1/no-such-resource??token=secret-value' },
    { method: 'get', url: '/v1/no-such-resource?a=%E2%9C%93&b=%20secret-value' },
  ] as const)(
    'should_return_no_query_in_the_error_body_when_the_unknown_route_uses_any_method_or_a_double_question_mark',
    async ({ method, url }) => {
      const response = await request(app.getHttpServer())[method](url);

      expect(response.status).toBe(404);
      expect(response.body.path).toBe('/v1/no-such-resource');
      expect(JSON.stringify(response.body)).not.toContain('secret-value');
    },
  );

  // The filter removes only the query. A message or a detail that does not
  // quote the query keeps its exact text.
  it('should_keep_message_and_details_unchanged_when_the_error_has_no_query', async () => {
    const response = await request(app.getHttpServer()).get('/v1/error-probe/invalid-fields?x=1');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: ['name must be a string', 'gameId should not be empty'],
      path: '/v1/error-probe/invalid-fields',
    });
  });

  it('should_return_error_body_when_path_parameter_fails_validation', async () => {
    const response = await request(app.getHttpServer()).get('/v1/error-probe/items/abc');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed (numeric string is expected)',
      details: [],
      path: '/v1/error-probe/items/abc',
    });
  });

  it('should_list_each_problem_in_details_when_several_fields_fail_validation', async () => {
    const response = await request(app.getHttpServer()).get('/v1/error-probe/invalid-fields');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: ['name must be a string', 'gameId should not be empty'],
      path: '/v1/error-probe/invalid-fields',
    });
  });

  it('should_return_error_body_when_token_is_missing', async () => {
    const response = await request(app.getHttpServer()).get('/v1/error-probe/protected');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing bearer token',
      details: [],
      path: '/v1/error-probe/protected',
    });
  });

  it('should_hide_internal_message_when_handler_throws_unexpected_error', async () => {
    const response = await request(app.getHttpServer()).get('/v1/error-probe/crash');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      details: [],
      path: '/v1/error-probe/crash',
    });
  });

  // The body parser rejects a body over its limit of 100 kB with an error
  // that carries the status 413. The filter keeps that client status on every
  // route that takes a body (#136).
  it.each(['/v1/auth/login', '/v1/auth/register'])(
    'should_return_413_error_body_when_any_route_gets_a_json_body_over_the_limit',
    async (path) => {
      const body = { username: 'player', password: 'x'.repeat(200 * 1024) };

      const response = await request(app.getHttpServer()).post(path).send(body);

      expect(response.status).toBe(413);
      expect(response.body).toEqual({
        statusCode: 413,
        error: 'Payload Too Large',
        message: 'Payload Too Large',
        details: [],
        path,
      });
    },
  );

  // Each 4xx error of the body parser keeps its status, not only the error of
  // the size. The JSON parser reads only a UTF charset. The message never quotes the charset that the client sent.
  it('should_return_415_error_body_when_the_json_body_has_an_unsupported_charset', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('Content-Type', 'application/json; charset=iso-8859-1')
      .send('{"username":"player","password":"secret"}');

    expect(response.status).toBe(415);
    expect(response.body).toEqual({
      statusCode: 415,
      error: 'Unsupported Media Type',
      message: 'Unsupported Media Type',
      details: [],
      path: '/v1/auth/login',
    });
  });

  // Nest turns the SyntaxError of the body parser into a 400.
  it('should_return_400_error_body_when_the_json_body_is_malformed', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username":');

    expect(response.status).toBe(400);
    expect(Object.keys(response.body).sort()).toEqual(ERROR_BODY_KEYS);
    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      details: [],
      path: '/v1/auth/login',
    });
  });

  // A missing route, a failed validation, a missing token and a crash give
  // four different errors. Each error is one case (#184).
  it.each([
    '/v1/no-such-resource',
    '/v1/error-probe/items/abc',
    '/v1/error-probe/protected',
    '/v1/error-probe/crash',
  ])('should_use_same_body_keys_when_errors_differ', async (url) => {
    const response = await request(app.getHttpServer()).get(url);

    expect(Object.keys(response.body).sort()).toEqual(ERROR_BODY_KEYS);
  });

  it('should_keep_success_body_when_request_succeeds', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/error-probe/protected')
      .set('Authorization', 'Bearer any');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
