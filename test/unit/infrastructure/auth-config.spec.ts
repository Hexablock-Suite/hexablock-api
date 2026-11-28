import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UserId } from '../../../src/domain/shared/user-id.js';
import {
  readAuthThrottle,
  readJwtSecret,
  readLevelEditors,
} from '../../../src/infrastructure/auth/auth-config.js';
import { valueOf } from '../../support/result.js';
import { testUserId } from '../../support/user-ids.js';

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

const userId = (n: number): UserId => valueOf(UserId.from(testUserId(n)));

// #145: LEVEL_EDITOR_IDS lists the user ids that may update the levels.
describe('readLevelEditors', () => {
  it('should_include_no_account_when_level_editor_ids_is_not_set', () => {
    const editors = readLevelEditors({});

    expect(editors.includes(userId(1))).toBe(false);
  });

  it.each(['', '   ', ' , ,'])(
    'should_include_no_account_when_level_editor_ids_holds_no_id',
    (value) => {
      const editors = readLevelEditors({ LEVEL_EDITOR_IDS: value });

      expect(editors.includes(userId(1))).toBe(false);
    },
  );

  it('should_include_each_listed_id_when_the_ids_have_spaces_and_empty_entries', () => {
    const editors = readLevelEditors({
      LEVEL_EDITOR_IDS: ` ${testUserId(1)} ,, ${testUserId(3)} ,`,
    });

    expect(editors.includes(userId(1))).toBe(true);
    expect(editors.includes(userId(3))).toBe(true);
    expect(editors.includes(userId(2))).toBe(false);
  });

  it('should_throw_when_level_editor_ids_holds_an_entry_that_is_not_a_user_id', () => {
    expect(() => readLevelEditors({ LEVEL_EDITOR_IDS: `${testUserId(1)}, ada` })).toThrow(
      'LEVEL_EDITOR_IDS holds "ada", which is not a user id. Each entry must be a UUID.',
    );
  });
});

// #170: AUTH_RATE_LIMIT sets the rate limit of sign-up and sign-in. A value
// that is not a whole number of 1 or more, or "off", stops the start, as a
// wrong LEVEL_EDITOR_IDS does.
describe('readAuthThrottle', () => {
  it.each(['0', '-3', '2.5', 'ten', '1e3', 'OFF'])(
    'should_throw_when_auth_rate_limit_is_not_a_whole_number_of_1_or_more_or_off',
    (value) => {
      expect(() => readAuthThrottle({ AUTH_RATE_LIMIT: value })).toThrow(
        `AUTH_RATE_LIMIT holds "${value}", which is not a whole number of 1 or more or "off".`,
      );
    },
  );

  it.each([undefined, '', ' 7 ', 'off', ' off '])(
    'should_return_options_when_auth_rate_limit_is_unset_a_whole_number_or_off',
    (value) => {
      expect(() => readAuthThrottle({ AUTH_RATE_LIMIT: value })).not.toThrow();
    },
  );

  // Production refuses a limit that is off, as it refuses the example
  // JWT secret.
  it.each(['off', ' off '])(
    'should_throw_when_auth_rate_limit_is_off_and_node_env_is_production',
    (value) => {
      expect(() => readAuthThrottle({ NODE_ENV: 'production', AUTH_RATE_LIMIT: value })).toThrow(
        'AUTH_RATE_LIMIT is off, which production refuses. Set a whole number of 1 or more, or leave it unset for 10.',
      );
    },
  );

  it.each([undefined, '5'])(
    'should_return_options_when_auth_rate_limit_is_unset_or_a_whole_number_and_node_env_is_production',
    (value) => {
      expect(() =>
        readAuthThrottle({ NODE_ENV: 'production', AUTH_RATE_LIMIT: value }),
      ).not.toThrow();
    },
  );
});
