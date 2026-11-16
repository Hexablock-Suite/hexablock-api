import type { Ordered } from '../shared/ordered.js';
import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The code of the broken rule. The border writes the message (decision 11).
export type CharacterCountProblem = 'invalid-character-count';

// The number of characters of a text, such as the length of a username or a
// password. A character is one Unicode code point, so an emoji is one
// character (NIST SP 800-63B §5.1.1.2). The count orders itself, so the
// credential limits are a Range<CharacterCount> (#99). Username, Password
// and PasswordAttempt count their text only here. The name is provisional
// until the team reviews it.
export class CharacterCount implements Ordered<CharacterCount> {
  private constructor(private readonly value: number) {}

  // A count is a non-negative safe integer. -0 counts as zero.
  static of(value: number): Result<CharacterCount, CharacterCountProblem> {
    return Number.isSafeInteger(value) && value >= 0
      ? ok(new CharacterCount(value))
      : err('invalid-character-count');
  }

  // Counts the code points of a text, not its UTF-16 units. Every text has a
  // count, so this factory cannot fail and returns the count itself.
  // Array.from gives the same code points as [...text]. The lint rule
  // no-misused-spread forbids the spread of a string.
  static ofText(text: string): CharacterCount {
    return new CharacterCount(Array.from(text).length);
  }

  // An equal count is not after the other count.
  isAfter(other: CharacterCount): boolean {
    return this.value > other.value;
  }

  equals(other: CharacterCount): boolean {
    return this.value === other.value;
  }

  // Delivers the count to a receiver of the border, for the OpenAPI limits
  // and the HTTP messages. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }
}
