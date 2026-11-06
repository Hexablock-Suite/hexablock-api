import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readJwtSecret } from '../../../src/infrastructure/auth/auth-config.js';

// The value that .env.example ships.
const EXAMPLE_JWT_SECRET = /^JWT_SECRET=(.+)$/m.exec(
  readFileSync(resolve(import.meta.dirname, '../../../.env.example'), 'utf8'),
)?.[1];

describe('readJwtSecret', () => {
  it('should_return_secret_when_jwt_secret_has_at_least_32_characters', () => {
    const secret = 's'.repeat(32);

    expect(readJwtSecret({ JWT_SECRET: secret })).toBe(secret);
  });

  it('should_throw_when_jwt_secret_is_missing', () => {
    expect(() => readJwtSecret({})).toThrow(
      'JWT_SECRET is not set. Copy .env.example and set a random value of at least 32 characters.',
    );
  });

  it('should_throw_when_jwt_secret_is_shorter_than_32_characters', () => {
    expect(() => readJwtSecret({ JWT_SECRET: 's'.repeat(31) })).toThrow(
      'JWT_SECRET must have at least 32 characters.',
    );
  });

  it('should_throw_when_example_secret_is_used_in_production', () => {
    expect(() => readJwtSecret({ NODE_ENV: 'production', JWT_SECRET: EXAMPLE_JWT_SECRET })).toThrow(
      'JWT_SECRET still holds the example value of .env.example.',
    );
  });

  it('should_accept_example_secret_when_node_env_is_not_production', () => {
    expect(readJwtSecret({ JWT_SECRET: EXAMPLE_JWT_SECRET })).toBe(EXAMPLE_JWT_SECRET);
  });
});
