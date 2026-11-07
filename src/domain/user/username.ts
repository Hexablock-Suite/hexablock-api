import { Range } from '../shared/range.js';
import { err, ok, type Result } from '../shared/result.js';

// 3 to 32 letters, digits, dots, hyphens or underscores. A proposal for
// team review: API-FR-01 sets no length or character rule.
export const USERNAME_LENGTH = Range.ofNumbers(3, 32);

const ALLOWED_CHARACTERS = 'A-Za-z0-9._-';
const ONLY_ALLOWED_CHARACTERS = new RegExp(`^[${ALLOWED_CHARACTERS}]*$`);

// The same rule as one pattern, for the OpenAPI schema of the request body.
export const USERNAME_PATTERN = `^[${ALLOWED_CHARACTERS}]{${USERNAME_LENGTH.min},${USERNAME_LENGTH.max}}$`;

export type UsernameProblem = 'invalid-username';

// The name a player signs in with. It keeps the letter case that the player
// typed. Sign-in compares the name as typed.
// The key is the name in lower case. Two users never have the same key, so
// `Ada` cannot register after `ada` (#62). The key is the one definition of
// that rule: the persistence adapter stores it and compares it, and the
// database only keeps it unique (#73).
export class Username {
  readonly key: string;

  // Every allowed character is ASCII, so toLowerCase() changes only A to Z.
  private constructor(readonly value: string) {
    this.key = value.toLowerCase();
  }

  // Every allowed character is ASCII, so the UTF-16 length of an accepted
  // name equals its code point count.
  static create(raw: string): Result<Username, UsernameProblem> {
    return ONLY_ALLOWED_CHARACTERS.test(raw) && USERNAME_LENGTH.contains(raw.length)
      ? ok(new Username(raw))
      : err('invalid-username');
  }
}
