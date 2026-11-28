import request from 'supertest';
import { users } from '../src/adapters/persistence/schema.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../src/application/ports/password-hasher.js';
import { buildOpenApiDocument } from '../src/infrastructure/http-app.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';

// API-FR-01, #170: sign-up and sign-in have a rate limit for each client.
// AUTH_RATE_LIMIT sets the number of requests of one client to each of the
// two routes in one minute. A request over the limit answers 429 before any
// use case runs, so it costs no hash work and stores nothing.
const PASSWORD = 'correct horse battery';
const REGISTER = '/v1/auth/register';
const LOGIN = '/v1/auth/login';
const tooManyRequests = (path: string) => ({
  statusCode: 429,
  error: 'Too Many Requests',
  message: 'Too many requests. Try again later.',
  details: [],
  path,
});

// Each test hashes several passwords with the scrypt cost of production and
// starts a new app, so one test can pass the default 5 s on a busy CI runner.
// The setting holds for this file only: Vitest isolates each test file.
vi.setConfig({ testTimeout: 20_000 });

describe('rate limit of sign-up and sign-in (API-FR-01)', () => {
  let testApp: TestApp;

  afterEach(async () => {
    vi.restoreAllMocks();
    await testApp.close();
  });

  const server = () => testApp.app.getHttpServer();
  const post = (path: string, body: object) => request(server()).post(path).send(body);
  const storedNames = async () =>
    (await testApp.database.db.select().from(users)).map((row) => row.username).sort();
  const expectRetryAfterWithinTheWindow = (header: unknown) => {
    const seconds = Number(header);
    expect(Number.isInteger(seconds)).toBe(true);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(60);
  };

  it('should_answer_429_and_store_no_user_when_a_client_signs_up_more_times_than_the_limit', async () => {
    testApp = await createTestApp([], { authRateLimit: '2' });

    const first = await post(REGISTER, { username: 'ada', password: PASSWORD });
    const second = await post(REGISTER, { username: 'grace', password: PASSWORD });
    const third = await post(REGISTER, { username: 'linus', password: PASSWORD });

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.headers['x-ratelimit-limit']).toBe('2');
    expect([
      first.headers['x-ratelimit-remaining'],
      second.headers['x-ratelimit-remaining'],
    ]).toEqual(['1', '0']);
    expectRetryAfterWithinTheWindow(first.headers['x-ratelimit-reset']);
    expect(third.status).toBe(429);
    expect(third.body).toEqual(tooManyRequests(REGISTER));
    expectRetryAfterWithinTheWindow(third.headers['retry-after']);
    expect(await storedNames()).toEqual(['ada', 'grace']);
  });

  it('should_answer_429_without_hash_work_when_a_client_signs_in_more_times_than_the_limit_after_it_reaches_the_sign_up_limit', async () => {
    testApp = await createTestApp([], { authRateLimit: '2' });
    await post(REGISTER, { username: 'ada', password: PASSWORD });
    await post(REGISTER, { username: 'grace', password: PASSWORD });

    const first = await post(LOGIN, { username: 'ada', password: PASSWORD });
    const second = await post(LOGIN, { username: 'grace', password: PASSWORD });
    const hasher = testApp.app.get<PasswordHasher>(PASSWORD_HASHER);
    const verify = vi.spyOn(hasher, 'verify');
    const hash = vi.spyOn(hasher, 'hash');
    const third = await post(LOGIN, { username: 'ada', password: PASSWORD });

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(third.status).toBe(429);
    expect(third.body).toEqual(tooManyRequests(LOGIN));
    expectRetryAfterWithinTheWindow(third.headers['retry-after']);
    expect({ verify: verify.mock.calls.length, hash: hash.mock.calls.length }).toEqual({
      verify: 0,
      hash: 0,
    });
  });

  it('should_answer_the_other_routes_when_the_client_is_over_the_sign_in_limit', async () => {
    testApp = await createTestApp([], { authRateLimit: '1' });
    await post(REGISTER, { username: 'ada', password: PASSWORD });
    const login = await post(LOGIN, { username: 'ada', password: PASSWORD });
    const blocked = await post(LOGIN, { username: 'ada', password: PASSWORD });

    const me = await request(server())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${String(login.body.accessToken)}`);
    const health = await request(server()).get('/v1/health');

    expect(blocked.status).toBe(429);
    expect(me.status).toBe(200);
    expect(health.status).toBe(200);
  });

  it('should_answer_429_after_10_sign_ins_when_auth_rate_limit_is_not_set', async () => {
    testApp = await createTestApp([], { authRateLimit: null });

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await post(LOGIN, { username: 'ada', password: PASSWORD });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([...Array<number>(10).fill(401), 429]);
  });

  it('should_answer_no_429_when_the_test_harness_signs_in_more_times_than_the_default_limit', async () => {
    testApp = await createTestApp();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await post(LOGIN, { username: 'ada', password: PASSWORD });
      statuses.push(response.status);
    }

    expect(statuses).toEqual(Array<number>(12).fill(401));
  });
});

// The OpenAPI document describes the rate limit headers and the 429 answer of
// sign-up and sign-in. One app builds the document for every case of this
// block, and each case checks one header or one answer (#184).
describe('OpenAPI document of the rate limit of sign-up and sign-in (API-FR-01)', () => {
  let testApp: TestApp;
  let document: ReturnType<typeof buildOpenApiDocument>;

  beforeAll(async () => {
    testApp = await createTestApp();
    document = buildOpenApiDocument(testApp.app);
  });

  afterAll(async () => {
    await testApp.close();
  });

  const ref = (name: string) => ({ $ref: `#/components/headers/${name}` });
  const counters = {
    'X-RateLimit-Limit': ref('X-RateLimit-Limit'),
    'X-RateLimit-Remaining': ref('X-RateLimit-Remaining'),
    'X-RateLimit-Reset': ref('X-RateLimit-Reset'),
  };
  const responsesOf = (path: string) => document.paths[path]?.post?.responses ?? {};

  it.each([...Object.keys(counters), 'Retry-After'])(
    'should_define_the_header_as_an_integer_with_a_description_when_the_openapi_document_is_built',
    (name) => {
      const definitions = document.components?.headers ?? {};

      expect(definitions[name]).toMatchObject({ schema: { type: 'integer' } });
      expect((definitions[name] as { description?: string }).description).toBeTruthy();
    },
  );

  it.each([
    { path: REGISTER, status: '201' },
    { path: REGISTER, status: '400' },
    { path: REGISTER, status: '409' },
    { path: LOGIN, status: '200' },
    { path: LOGIN, status: '400' },
    { path: LOGIN, status: '401' },
  ])(
    'should_list_the_rate_limit_counters_in_the_answer_when_the_openapi_document_is_built',
    ({ path, status }) => {
      const answer = responsesOf(path)[status] as { headers?: unknown };

      expect(answer.headers).toEqual(counters);
    },
  );

  it.each([REGISTER, LOGIN])(
    'should_describe_the_429_answer_with_retry_after_and_the_error_body_when_the_openapi_document_is_built',
    (path) => {
      const answer = responsesOf(path)['429'] as {
        description?: string;
        headers?: Record<string, unknown>;
        content?: Record<string, { schema?: { $ref?: string } }>;
      };

      expect(answer.description).toContain('Retry-After');
      expect(answer.headers).toEqual({ 'Retry-After': ref('Retry-After') });
      expect(answer.content?.['application/json']?.schema?.$ref).toBe(
        '#/components/schemas/ErrorDto',
      );
    },
  );
});
