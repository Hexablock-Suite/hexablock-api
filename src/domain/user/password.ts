import { Range } from '../shared/range.js';
import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The length of a password in code points. The upper limit keeps the hash
// work of one request bounded. Both limits are a proposal for team review:
// API-FR-01 sets no rule.
export const PASSWORD_LENGTH = Range.ofNumbers(8, 128);

export type PasswordProblem = 'invalid-password';

// A plain password that a new user chooses. Only the hash is stored.
export class Password {
  private constructor(private readonly value: string) {}

  static create(raw: string): Result<Password, PasswordProblem> {
    return PASSWORD_LENGTH.contains(Password.codePoints(raw))
      ? ok(new Password(raw))
      : err('invalid-password');
  }

  // Tells if a text is longer than any password. Sign-in asks this before it
  // hashes. It takes the raw text, because create() rejects a text this long.
  static isTooLong(raw: string): boolean {
    return PASSWORD_LENGTH.isExceededBy(Password.codePoints(raw));
  }

  // Counts Unicode code points, not UTF-16 units: an emoji is one character
  // (NIST SP 800-63B §5.1.1.2). Array.from gives the same code points as
  // [...raw]. The lint rule no-misused-spread forbids the spread of a string.
  private static codePoints(raw: string): number {
    return Array.from(raw).length;
  }

  // Delivers the plain text to a receiver. Only the adapter of the
  // PasswordHasher port receives it, to make the hash. No operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.value);
  }

  // Two passwords are equal when they hold the same text.
  // Sign-in never uses this method: it checks a password through the PasswordHasher port.
  equals(other: Password): boolean {
    return this.value === other.value;
  }
}
