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
    const response = await request(app.getHttpServer()).get('/no-such-resource');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot GET /no-such-resource',
      details: [],
      path: '/no-such-resource',
    });
  });

  // The query can hold a secret, such as a token, and a client can log the
  // error body. So path ends at the first «?» (RFC 3986 §3.3, gap G2.4).
  it('should_return_path_without_query_when_url_has_a_query', async () => {
    const server = app.getHttpServer();

    const probe = await request(server).get('/error-probe/items/abc?token=secret-value');
    const unknown = await request(server).get('/no-such-resource?token=secret-value?next=1');

    expect(probe.status).toBe(400);
    expect(probe.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed (numeric string is expected)',
      details: [],
      path: '/error-probe/items/abc',
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body.path).toBe('/no-such-resource');
  });

  // Nest answers an unknown route with «Cannot GET <url>». That url holds the
  // query, so the filter removes the query from the message too.
  it('should_return_no_query_in_the_error_body_when_the_route_is_unknown', async () => {
    const response = await request(app.getHttpServer()).get('/no-such-resource?token=secret-value');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot GET /no-such-resource',
      details: [],
      path: '/no-such-resource',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-value');
    expect(JSON.stringify(response.body)).not.toContain('?');
  });

  // The message names the method, and a query can start with a second «?» or
  // hold encoded characters. The body holds no part of the query in each case.
  it('should_return_no_query_in_the_error_body_when_the_unknown_route_uses_any_method_or_a_double_question_mark', async () => {
    const server = app.getHttpServer();
    const responses = await Promise.all([
      request(server).post('/no-such-resource?token=secret-value'),
      request(server).delete('/no-such-resource?token=secret-value'),
      request(server).get('/no-such-resource??token=secret-value'),
      request(server).get('/no-such-resource?a=%E2%9C%93&b=%20secret-value'),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body.path).toBe('/no-such-resource');
      expect(JSON.stringify(response.body)).not.toContain('secret-value');
    }
  });

  // The filter removes only the query. A message or a detail that does not
  // quote the query keeps its exact text.
  it('should_keep_message_and_details_unchanged_when_the_error_has_no_query', async () => {
    const response = await request(app.getHttpServer()).get('/error-probe/invalid-fields?x=1');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: ['name must be a string', 'gameId should not be empty'],
      path: '/error-probe/invalid-fields',
    });
  });

  it('should_return_error_body_when_path_parameter_fails_validation', async () => {
    const response = await request(app.getHttpServer()).get('/error-probe/items/abc');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed (numeric string is expected)',
      details: [],
      path: '/error-probe/items/abc',
    });
  });

  it('should_list_each_problem_in_details_when_several_fields_fail_validation', async () => {
    const response = await request(app.getHttpServer()).get('/error-probe/invalid-fields');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: ['name must be a string', 'gameId should not be empty'],
      path: '/error-probe/invalid-fields',
    });
  });

  it('should_return_error_body_when_token_is_missing', async () => {
    const response = await request(app.getHttpServer()).get('/error-probe/protected');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing bearer token',
      details: [],
      path: '/error-probe/protected',
    });
  });

  it('should_hide_internal_message_when_handler_throws_unexpected_error', async () => {
    const response = await request(app.getHttpServer()).get('/error-probe/crash');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      details: [],
      path: '/error-probe/crash',
    });
  });

  it('should_use_same_body_keys_when_errors_differ', async () => {
    const server = app.getHttpServer();
    const responses = await Promise.all([
      request(server).get('/no-such-resource'),
      request(server).get('/error-probe/items/abc'),
      request(server).get('/error-probe/protected'),
      request(server).get('/error-probe/crash'),
    ]);

    for (const response of responses) {
      expect(Object.keys(response.body).sort()).toEqual(ERROR_BODY_KEYS);
    }
  });

  it('should_keep_success_body_when_request_succeeds', async () => {
    const response = await request(app.getHttpServer())
      .get('/error-probe/protected')
      .set('Authorization', 'Bearer any');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
