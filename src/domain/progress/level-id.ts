import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';
import { CharacterCount } from '../user/character-count.js';
import { INCOMING_ID_LENGTH } from './incoming-id-length.js';

// The code of the broken rule. The border writes the message (decision 11).
export type LevelIdProblem = 'invalid-level-id';

// Value object for the id of one level of a game, such as fit-01. The id is
// a non-blank text, kept as it arrives.
export class LevelId {
  private constructor(private readonly value: string) {}

  // Builds a levelId that the API already holds: a stored row. A stored row
  // keeps what it holds, so this factory has no length or character bound.
  static of(value: string): Result<LevelId, LevelIdProblem> {
    return typeof value === 'string' && value.trim() !== ''
      ? ok(new LevelId(value))
      : err('invalid-level-id');
  }

  // Builds a levelId that a client sends, in a body or a path. It also holds
  // INCOMING_ID_LENGTH characters at most and no control character, which
  // a text column cannot always hold: Postgres rejects U+0000 (#135).
  static ofIncoming(value: string): Result<LevelId, LevelIdProblem> {
    const levelId = LevelId.of(value);
    return levelId.ok &&
      INCOMING_ID_LENGTH.contains(CharacterCount.ofText(value)) &&
      !holdsControlCharacter(value)
      ? levelId
      : err('invalid-level-id');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.value);
  }

  equals(other: LevelId): boolean {
    return this.value === other.value;
  }
}

// A control character is U+0000 to U+001F or U+007F.
function holdsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}
