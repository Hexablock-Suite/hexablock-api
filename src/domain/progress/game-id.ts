import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';
import { CharacterCount } from '../user/character-count.js';
import { INCOMING_ID_LENGTH } from './incoming-id-length.js';

// The code of the broken rule. The border writes the message (decision 11).
export type GameIdProblem = 'invalid-game-id';

// A lowercase slug, such as hexa-lines, hexa-fit, hexa-sort or hexa-merge.
const GAME_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

// Value object for a game variant. It is an open value, not a closed list
// (classes.md decision 5): a new variant adds no code here.
export class GameId {
  private constructor(private readonly value: string) {}

  // Builds a gameId that the API already holds: a stored row or a name of
  // the composition root. A stored row keeps what it holds, so this factory
  // has no length bound.
  static of(value: string): Result<GameId, GameIdProblem> {
    return typeof value === 'string' && GAME_ID_PATTERN.test(value)
      ? ok(new GameId(value))
      : err('invalid-game-id');
  }

  // Builds a gameId that a client sends, in a body or a path. It also holds
  // INCOMING_ID_LENGTH characters at most (#135). The pattern already
  // allows no control character.
  static ofIncoming(value: string): Result<GameId, GameIdProblem> {
    const gameId = GameId.of(value);
    return gameId.ok && INCOMING_ID_LENGTH.contains(CharacterCount.ofText(value))
      ? gameId
      : err('invalid-game-id');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.value);
  }

  equals(other: GameId): boolean {
    return this.value === other.value;
  }
}
