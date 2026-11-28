import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { TEST_JWT_SECRET } from '../auth/test-jwt-secret.js';

export const TEST_PASSWORD = 'correct horse battery';

export interface SignedInUser {
  readonly token: string;
  readonly userId: string;
}

// Signs up and signs in through the auth endpoints. It returns the bearer
// token and the userId of its subject. The sign-up may fail, because the
// account can exist already. A failed sign-in throws an error with its status.
export async function signIn(
  server: App,
  username: string,
  password = TEST_PASSWORD,
): Promise<SignedInUser> {
  await request(server).post('/v1/auth/register').send({ username, password });
  const login = await request(server).post('/v1/auth/login').send({ username, password });
  if (login.status !== 200) {
    throw new Error(`the sign-in of ${username} answered ${login.status}, not 200.`);
  }
  const token: string = login.body.accessToken;
  const userId = new JwtService({ secret: TEST_JWT_SECRET }).decode<{ sub: string }>(token).sub;
  return { token, userId };
}
