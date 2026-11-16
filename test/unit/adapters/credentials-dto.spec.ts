import { USERNAME_PATTERN } from '../../../src/adapters/http/credentials.dto.js';
import { Username } from '../../../src/domain/user/username.js';

// One code point, two UTF-16 units.
const EMOJI = '\u{1F600}';

// #99: the domain exports no string, so the HTTP adapter writes the OpenAPI
// pattern of a username, and Username.create() checks the rule in the domain.
// The two must accept the same names. test/auth.e2e-spec.ts pins the text
// that openapi/openapi.json publishes.
describe('CredentialsDto username pattern', () => {
  it('should_keep_the_published_text_when_the_limits_of_the_domain_build_it', () => {
    expect(USERNAME_PATTERN).toBe('^[A-Za-z0-9._-]{3,32}$');
  });

  it.each([
    'ab',
    'ada',
    'ADA',
    'a'.repeat(32),
    'a'.repeat(33),
    'Grace.Hopper_01-x',
    '...',
    '',
    'ada lovelace',
    'ada!',
    `ad${EMOJI}`,
    'ädä',
    'ada\n',
  ])('should_accept_a_name_only_when_username_create_accepts_it', (name) => {
    expect(new RegExp(USERNAME_PATTERN).test(name)).toBe(Username.create(name).ok);
  });
});
