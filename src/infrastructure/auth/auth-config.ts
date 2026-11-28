import { JwtService } from '@nestjs/jwt';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { TOO_MANY_REQUESTS_MESSAGE } from '../../adapters/http/too-many-requests.response.js';
import { LevelEditors } from '../../domain/user/level-editors.js';
import { UserId } from '../../domain/shared/user-id.js';

// HS256 with a key of at least 256 bits, so the secret needs 32 characters.
const MIN_SECRET_LENGTH = 32;
// The value that .env.example ships. Production refuses it.
const EXAMPLE_SECRET = 'example-only-replace-with-32-random-characters';
// One day, with no refresh route: the decision of the product owner of
// 2026-11-19 on #170 (API-FR-01). The app asks the player to sign in again.
const TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;

// Only the infrastructure reads the environment.
export function readJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set. Copy .env.example and set a random value of at least 32 characters.',
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error('JWT_SECRET must have at least 32 characters.');
  }
  if (env.NODE_ENV === 'production' && secret === EXAMPLE_SECRET) {
    throw new Error('JWT_SECRET still holds the example value of .env.example.');
  }
  return secret;
}

// Reads LEVEL_EDITOR_IDS: the user ids, separated by commas, of the accounts
// that may update the levels (#145). The reader trims each entry and skips
// an empty one. An unset or empty variable gives an empty list, so no account
// may update (fail closed). An entry that is not a user id stops the start,
// as a missing JWT_SECRET does.
export function readLevelEditors(env: NodeJS.ProcessEnv = process.env): LevelEditors {
  const entries = (env.LEVEL_EDITOR_IDS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const ids = entries.map((entry) => {
    const id = UserId.from(entry);
    if (!id.ok) {
      throw new Error(
        `LEVEL_EDITOR_IDS holds "${entry}", which is not a user id. Each entry must be a UUID.`,
      );
    }
    return id.value;
  });
  return LevelEditors.of(ids);
}

// The window of the rate limit of sign-up and sign-in: one minute (#170).
const AUTH_RATE_WINDOW_MS = 60 * 1000;
// The requests of one client to each of the two routes in one window when
// AUTH_RATE_LIMIT is not set (decided on 2026-11-28, #170). Ten sign-ins in
// a minute cover the typing mistakes of a player, and they bound the scrypt
// work of one client.
const DEFAULT_AUTH_RATE_LIMIT = 10;
// The value of AUTH_RATE_LIMIT that turns the limit off. The test harness
// and the provider composition of the contract job use it. Production
// refuses it.
const AUTH_RATE_LIMIT_OFF = 'off';

// Reads AUTH_RATE_LIMIT: the number of requests that one client (one IP
// address) may send to sign-up, and the same number to sign-in, in one
// minute (#170). An unset or empty variable gives 10. "off" turns the limit
// off, except when NODE_ENV is production: then it stops the start, as the
// example JWT_SECRET does. Any other value that is not a whole number of 1 or more stops the
// start, as a wrong LEVEL_EDITOR_IDS does.
export function readAuthThrottle(env: NodeJS.ProcessEnv = process.env): ThrottlerModuleOptions {
  const value = (env.AUTH_RATE_LIMIT ?? '').trim();
  if (value === AUTH_RATE_LIMIT_OFF) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'AUTH_RATE_LIMIT is off, which production refuses. Set a whole number of 1 or more, or leave it unset for 10.',
      );
    }
    return {
      throttlers: [{ ttl: AUTH_RATE_WINDOW_MS, limit: DEFAULT_AUTH_RATE_LIMIT }],
      skipIf: () => true,
    };
  }
  const limit = value === '' ? DEFAULT_AUTH_RATE_LIMIT : Number(value);
  if (!/^\d*$/.test(value) || limit < 1) {
    throw new Error(
      `AUTH_RATE_LIMIT holds "${env.AUTH_RATE_LIMIT}", which is not a whole number of 1 or more or "off".`,
    );
  }
  return {
    throttlers: [{ ttl: AUTH_RATE_WINDOW_MS, limit }],
    errorMessage: TOO_MANY_REQUESTS_MESSAGE,
  };
}

// The one place that sets the algorithm and the lifetime of the tokens.
export function createJwtService(secret: string): JwtService {
  return new JwtService({
    secret,
    signOptions: { algorithm: 'HS256', expiresIn: TOKEN_LIFETIME_SECONDS },
    verifyOptions: { algorithms: ['HS256'] },
  });
}
