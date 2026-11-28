import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { USERNAME_PATTERN } from '../../src/adapters/http/credentials.dto.js';
import { receiveBoundValuesOf } from '../../src/adapters/received.js';
import { USERNAME_LENGTH } from '../../src/domain/user/username.js';

const DOCUMENT = resolve(import.meta.dirname, '../../openapi/openapi.json');

// The three row schemas of the leaderboards. Each row names its player by
// the username of the account.
const ROWS = ['LevelEntryDto', 'ScoreEntryDto', 'StandingEntryDto'] as const;

interface UsernameSchema {
  readonly description?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
}

// The username property of one schema of the committed OpenAPI document.
// The client generates its API types from that document.
function usernameOf(row: (typeof ROWS)[number]): UsernameSchema {
  const document = JSON.parse(readFileSync(DOCUMENT, 'utf8')) as {
    components: { schemas: Record<string, { properties: { username: UsernameSchema } }> };
  };
  return document.components.schemas[row].properties.username;
}

// #237: a client reads the username of a row from the document, so the
// description tells what the name is without an issue number, and the
// property declares the limits of the name rule that Username.create()
// checks: the bounds of USERNAME_LENGTH and the pattern of CredentialsDto.
describe('the username of a leaderboard row in openapi/openapi.json', () => {
  it('should_name_no_issue_when_the_document_describes_the_username_of_each_row', () => {
    expect(ROWS.map((row) => usernameOf(row).description)).toEqual(
      ROWS.map(() => expect.stringMatching(/^[^#]+$/)),
    );
  });

  it('should_declare_the_limits_of_the_name_rule_when_the_document_describes_the_username_of_each_row', () => {
    const { min, max } = receiveBoundValuesOf(USERNAME_LENGTH);

    expect(
      ROWS.map((row) => {
        const { minLength, maxLength, pattern } = usernameOf(row);
        return { row, minLength, maxLength, pattern };
      }),
    ).toEqual(
      ROWS.map((row) => ({ row, minLength: min, maxLength: max, pattern: USERNAME_PATTERN })),
    );
  });
});
