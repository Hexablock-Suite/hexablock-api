import request from 'supertest';
import { PASSWORD_HASHER, type PasswordHasher } from '../src/application/ports/password-hasher.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';

// API-FR-01, #105: AuthDtoMapper stops a sign-in username that breaks its
// rule, before LoginUseCase. The answer is the 401 of a wrong password, so
// sign-in keeps one way to fail for bad credentials. The request costs no
// hash work. No stored user has such a name, so the answer time tells
// nothing about the stored names.
const USERNAME = 'ada';
const PASSWORD = 'correct horse battery';
const UNAUTHORIZED = {
  statusCode: 401,
  error: 'Unauthorized',
  message: 'Invalid username or password',
  details: [],
  path: '/v1/auth/login',
};

// One app and one database for the file: each sign-in only reads the user
// that beforeAll() stores.
describe('sign-in with a malformed username (API-FR-01)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
    // The comparison with a wrong password needs a stored user, so a failed
    // sign-up stops the file here.
    const signUp = await request(testApp.app.getHttpServer())
      .post('/v1/auth/register')
      .send({ username: USERNAME, password: PASSWORD });
    if (signUp.status !== 201) {
      throw new Error(`The sign-up of the stored user answered ${signUp.status}.`);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await testApp.close();
  });

  const post = (body: object) =>
    request(testApp.app.getHttpServer()).post('/v1/auth/login').send(body);

  it.each([
    ['a!', PASSWORD],
    ['ab', PASSWORD],
    ['', PASSWORD],
    ['a'.repeat(33), PASSWORD],
    ['ada lovelace', PASSWORD],
    ['a!', 'x'.repeat(129)],
  ])(
    'should_answer_the_401_of_a_wrong_password_without_hash_work_when_the_sign_in_username_breaks_its_rule',
    async (username, password) => {
      const hasher = testApp.app.get<PasswordHasher>(PASSWORD_HASHER);
      const verify = vi.spyOn(hasher, 'verify');
      const hash = vi.spyOn(hasher, 'hash');

      const malformed = await post({ username, password });
      const hashWork = { verify: verify.mock.calls.length, hash: hash.mock.calls.length };
      const wrongPassword = await post({ username: USERNAME, password: 'wrong password' });

      expect(malformed.status).toBe(401);
      expect(malformed.body).toEqual(UNAUTHORIZED);
      expect(wrongPassword.status).toBe(401);
      expect(malformed.body).toEqual(wrongPassword.body);
      expect(hashWork).toEqual({ verify: 0, hash: 0 });
    },
  );
});
