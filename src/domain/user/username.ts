import { Range } from '../shared/range.js';
import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';
import { CharacterCount } from './character-count.js';

// The value of a limit of this file. A limit is a fixed count, so a failed
// Result is a defect of the code.
function limit(count: number): CharacterCount {
  const result = CharacterCount.of(count);
  if (!result.ok) {
    throw new RangeError(`A username limit breaks the rule ${result.error}.`);
  }
  return result.value;
}

// 3 to 32 letters, digits, dots, hyphens or underscores. A proposal for
// team review: API-FR-01 sets no length or character rule. The range
// delivers its bounds to the OpenAPI limits and the messages of the border.
// The OpenAPI pattern lives in the HTTP adapter, so this module exports no
// string (#99).
export const USERNAME_LENGTH = Range.of(limit(3), limit(32));

const ONLY_ALLOWED_CHARACTERS = /^[A-Za-z0-9._-]*$/;

export type UsernameProblem = 'invalid-username';

// The name a player signs in with. It keeps the letter case that the player
// typed. Sign-in compares the name as typed.
// The key is the name in lower case. Two names collide when their keys are
// equal, and no two users have names that collide, so `Ada` cannot register
// after `ada` (#62). collidesWith() is the business name of that rule (#100).
// The persistence adapter stores the key and compares it in SQL, and the
// database only keeps it unique (#73).
export class Username {
  private readonly key: string;

  // Every allowed character is ASCII, so toLowerCase() changes only A to Z.
  private constructor(private readonly value: string) {
    this.key = value.toLowerCase();
  }

  // The name counts its characters through CharacterCount, as a password
  // does. Every allowed character is ASCII, so one character is one UTF-16 unit.
  static create(raw: string): Result<Username, UsernameProblem> {
    return ONLY_ALLOWED_CHARACTERS.test(raw) && USERNAME_LENGTH.contains(CharacterCount.ofText(raw))
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

  // Tells if two names collide: they differ at most in letter case. `Ada`
  // and `ada` collide, `Ada` and `Adb` do not, and a name collides with itself.
  // The UserRepository contract checks that the SQL of the adapter agrees.
  collidesWith(other: Username): boolean {
    return this.key === other.key;
  }
}
