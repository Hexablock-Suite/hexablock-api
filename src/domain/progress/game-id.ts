import type { ValueReceiver } from '../shared/value-receiver.js';
import { ProgressError } from './progress-error.js';

// A lowercase slug, such as lines, fit, sort or merge.
const GAME_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

// Value object for a game variant. It is an open value, not a closed list
// (classes.md decision 5): a new variant adds no code here.
export class GameId {
  private constructor(private readonly value: string) {}

  static of(value: string): GameId {
    if (typeof value !== 'string' || !GAME_ID_PATTERN.test(value)) {
      throw new ProgressError(`gameId must be a lowercase slug, got ${JSON.stringify(value)}.`);
    }
    return new GameId(value);
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.value);
  }

  equals(other: GameId): boolean {
    return this.value === other.value;
  }
}
