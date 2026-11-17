import { Range } from '../shared/range.js';
import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';
import { CharacterCount } from './character-count.js';

// The length of a password in characters: 8 to 128 code points. The upper
// limit keeps the hash work of one request bounded. Both limits are a
// proposal for team review: API-FR-01 sets no rule.
export const PASSWORD_LENGTH = Range.of(
  CharacterCount.ofLimit(8, 'password'),
  CharacterCount.ofLimit(128, 'password'),
);

export type PasswordProblem = 'invalid-password';

// A plain password that a new user chooses. Only the hash is stored. The
// text that a player types at sign-in is a PasswordAttempt, not a Password.
//
// The text is an ECMAScript private field, not a TypeScript private field.
// So the text is no property of the object at run time: JSON.stringify(),
// util.inspect() and a logger show no text (#138). Only deliverTo() gives it.
export class Password {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  // CharacterCount counts code points, not UTF-16 units: an emoji is one character.
  static create(raw: string): Result<Password, PasswordProblem> {
    return PASSWORD_LENGTH.contains(CharacterCount.ofText(raw))
      ? ok(new Password(raw))
      : err('invalid-password');
  }

  // Delivers the plain text to a receiver. Only the adapter of the
  // PasswordHasher port receives it, to make the hash. No operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.#value);
  }

  // Two passwords are equal when they hold the same text.
  // Sign-in never uses this method: it checks a password through the PasswordHasher port.
  equals(other: Password): boolean {
    return this.#value === other.#value;
  }
}
