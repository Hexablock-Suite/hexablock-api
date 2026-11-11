import { Range } from '../shared/range.js';
import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// 3 to 32 letters, digits, dots, hyphens or underscores. A proposal for
// team review: API-FR-01 sets no length or character rule.
const MIN_LENGTH = 3;
const MAX_LENGTH = 32;
export const USERNAME_LENGTH = Range.ofNumbers(MIN_LENGTH, MAX_LENGTH);

const ALLOWED_CHARACTERS = 'A-Za-z0-9._-';
const ONLY_ALLOWED_CHARACTERS = new RegExp(`^[${ALLOWED_CHARACTERS}]*$`);

// The same rule as one pattern, for the OpenAPI schema of the request body.
// It uses the two limits that build USERNAME_LENGTH, so it reads no bound of the range.
export const USERNAME_PATTERN = `^[${ALLOWED_CHARACTERS}]{${MIN_LENGTH},${MAX_LENGTH}}$`;

export type UsernameProblem = 'invalid-username';

// The name a player signs in with. It keeps the letter case that the player
// typed. Sign-in compares the name as typed.
// The key is the name in lower case. Two users never have the same key, so
// `Ada` cannot register after `ada` (#62). The key is the one definition of
// that rule: the persistence adapter stores it and compares it, and the
// database only keeps it unique (#73).
export class Username {
  private readonly key: string;

  // Every allowed character is ASCII, so toLowerCase() changes only A to Z.
  private constructor(private readonly value: string) {
    this.key = value.toLowerCase();
  }

  // Every allowed character is ASCII, so the UTF-16 length of an accepted
  // name equals its code point count.
  static create(raw: string): Result<Username, UsernameProblem> {
    return ONLY_ALLOWED_CHARACTERS.test(raw) && USERNAME_LENGTH.contains(raw.length)
      ? ok(new Username(raw))
      : err('invalid-username');
  }

  // Delivers the name as typed to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.value);
  }

  // Delivers the key to a receiver of the border. The persistence adapter
  // stores it and compares it.
  deliverKeyTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.key);
  }

  // Two names are equal when they have the same letters in the same case.
  // `Ada` and `ada` are two names with one key.
  equals(other: Username): boolean {
    return this.value === other.value;
  }
}
