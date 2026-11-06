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
// token and the userId of its subject.
export async function signIn(server: App, username: string): Promise<SignedInUser> {
  await request(server).post('/auth/register').send({ username, password: TEST_PASSWORD });
  const login = await request(server)
    .post('/auth/login')
    .send({ username, password: TEST_PASSWORD });
  const token: string = login.body.accessToken;
  const userId = new JwtService({ secret: TEST_JWT_SECRET }).decode<{ sub: string }>(token).sub;
  return { token, userId };
}
