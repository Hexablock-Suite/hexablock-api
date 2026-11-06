import { JwtService } from '@nestjs/jwt';

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

// The one place that sets the algorithm and the lifetime of the tokens.
export function createJwtService(secret: string): JwtService {
  return new JwtService({
    secret,
    signOptions: { algorithm: 'HS256', expiresIn: TOKEN_LIFETIME_SECONDS },
    verifyOptions: { algorithms: ['HS256'] },
  });
}
