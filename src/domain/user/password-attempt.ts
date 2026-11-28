import type { ValueReceiver } from '../shared/value-receiver.js';
import { CharacterCount } from '../shared/character-count.js';
import { PASSWORD_LENGTH } from './password.js';

// The text that a player types as the password at sign-in. It is not a
// Password: a wrong password can have any length, also less than the
// minimum of a Password, and sign-in still checks it against the hash. So
// the attempt has no length rule, and its factory cannot fail. The name is
// provisional until the team reviews it (#98).
//
// The text is an ECMAScript private field, not a TypeScript private field.
// So the text is no property of the object at run time: JSON.stringify(),
// util.inspect() and a logger show no text. Only deliverTo() gives it.
export class PasswordAttempt {
  readonly #typed: string;

  private constructor(typed: string) {
    this.#typed = typed;
  }

  // Takes the text as the player typed it. Every text is an attempt, also the empty text.
  static of(typed: string): PasswordAttempt {
    return new PasswordAttempt(typed);
  }

  // Tells if the attempt is longer than any password. Sign-in asks this
  // before any hash work, so the hash work of one request stays bounded. The
  // attempt counts its characters through CharacterCount, as Password.create()
  // does: an emoji is one character.
  isLongerThanAnyPassword(): boolean {
    return PASSWORD_LENGTH.isExceededBy(CharacterCount.ofText(this.#typed));
  }

  // Delivers the typed text to a receiver. Only the adapter of the
  // PasswordHasher port receives it, to check it against a hash. No
  // operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.#typed);
  }
}
