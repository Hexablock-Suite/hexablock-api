import { JwtService } from '@nestjs/jwt';
import { LevelEditors } from '../../domain/user/level-editors.js';
import { UserId } from '../../domain/user/user-id.js';

// HS256 with a key of at least 256 bits, so the secret needs 32 characters.
const MIN_SECRET_LENGTH = 32;
// The value that .env.example ships. Production refuses it.
const EXAMPLE_SECRET = 'example-only-replace-with-32-random-characters';
// A proposal for team review: one day, with no refresh token.
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

// The one place that sets the algorithm and the lifetime of the tokens.
export function createJwtService(secret: string): JwtService {
  return new JwtService({
    secret,
    signOptions: { algorithm: 'HS256', expiresIn: TOKEN_LIFETIME_SECONDS },
    verifyOptions: { algorithms: ['HS256'] },
  });
}
