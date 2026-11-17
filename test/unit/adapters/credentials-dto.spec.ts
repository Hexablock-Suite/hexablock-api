import { USERNAME_PATTERN } from '../../../src/adapters/http/credentials.dto.js';
import { receiveBoundValuesOf, receiveValueOf } from '../../../src/adapters/received.js';
import type { ValueReceiver } from '../../../src/domain/shared/value-receiver.js';
import {
  USERNAME_CHARACTERS,
  USERNAME_LENGTH,
  Username,
} from '../../../src/domain/user/username.js';

// One code point, two UTF-16 units.
const EMOJI = '\u{1F600}';

const USERNAME_MODULE = '../../../src/domain/user/username.js';

// #149: the domain holds the allowed characters of a username once. The HTTP
// adapter builds the OpenAPI pattern from the characters of
// USERNAME_CHARACTERS and the limits of USERNAME_LENGTH, and
// Username.create() checks the same rule in the domain. The two must accept
// the same names. test/auth.e2e-spec.ts pins the text that
// openapi/openapi.json publishes.
describe('CredentialsDto username pattern', () => {
  afterEach(() => {
    vi.doUnmock(USERNAME_MODULE);
    vi.resetModules();
  });

  it('should_keep_the_published_text_when_the_limits_of_the_domain_build_it', () => {
    expect(USERNAME_PATTERN).toBe('^[A-Za-z0-9._-]{3,32}$');
  });

  it('should_build_the_pattern_from_what_the_domain_delivers_when_the_dto_loads', () => {
    const { min, max } = receiveBoundValuesOf(USERNAME_LENGTH);

    expect(USERNAME_PATTERN).toBe(`^${receiveValueOf(USERNAME_CHARACTERS)}{${min},${max}}$`);
  });

  // The DTO holds no character list of its own: other characters in the
  // domain give another pattern.
  it('should_publish_other_characters_when_the_domain_delivers_other_characters', async () => {
    vi.resetModules();
    vi.doMock(USERNAME_MODULE, async (importOriginal) => ({
      ...(await importOriginal<object>()),
      USERNAME_CHARACTERS: {
        deliverTo(receiver: ValueReceiver<string>): void {
          receiver.receive('[xyz]');
        },
      },
    }));

    const dto = await import('../../../src/adapters/http/credentials.dto.js');

    expect(dto.USERNAME_PATTERN).toBe('^[xyz]{3,32}$');
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
