import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The code of the broken rule. The border writes the message (decision 11).
export type PasswordHashProblem = 'invalid-password-hash';

// The stored form of a password. The domain never reads its format: only
// the PasswordHasher port makes and checks it.
//
// The text is an ECMAScript private field, not a TypeScript private field.
// So the text is no property of the object at run time: JSON.stringify(),
// util.inspect() and a logger show no hash (#138). A User holds its hash,
// so a User shows no hash either. Only deliverTo() gives the text.
export class PasswordHash {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static from(value: string): Result<PasswordHash, PasswordHashProblem> {
    return value.length > 0 ? ok(new PasswordHash(value)) : err('invalid-password-hash');
  }

  // Delivers the text to a receiver of the border: the users row or the
  // adapter of the PasswordHasher port. No operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.#value);
  }

  // Two hashes are equal when they hold the same text.
  // Sign-in never uses this method: it checks a password through the PasswordHasher port.
  equals(other: PasswordHash): boolean {
    return this.#value === other.#value;
  }
}
