import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The code of the broken rule. The border writes the message (decision 11).
export type StarsProblem = 'invalid-stars';

// The most stars of one play that a client can send: the largest value of
// the Postgres integer column level_results.stars (#135).
const MOST_OF_ONE_PLAY = 2_147_483_647;

// Value object for the stars that a player earns in one level, or for a
// total of stars. It is a non-negative safe integer.
export class Stars {
  private constructor(private readonly value: number) {}

  // Builds the stars of a value that the API already holds: a stored row, or
  // a total that sums the stored rows. A total can exceed one column, and a
  // stored row keeps what it holds, so this factory has no upper bound.
  static of(value: number): Result<Stars, StarsProblem> {
    return Number.isSafeInteger(value) && value >= 0 ? ok(new Stars(value)) : err('invalid-stars');
  }

  // Builds the stars of one play that a client sends. They must also fit
  // the column that stores them, so a value over MOST_OF_ONE_PLAY stops at
  // the border with invalid-stars (#135).
  static ofIncoming(value: number): Result<Stars, StarsProblem> {
    const stars = Stars.of(value);
    return stars.ok && value <= MOST_OF_ONE_PLAY ? stars : err('invalid-stars');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }

  equals(other: Stars): boolean {
    return this.value === other.value;
  }

  // More stars is the better result (DS-4). An equal count is not more.
  isMoreThan(other: Stars): boolean {
    return this.value > other.value;
  }
}

// The most stars of one play. The border receives it for the OpenAPI limit
// and the message of the rule, so the number has one home.
export const MOST_STARS_OF_ONE_PLAY: Stars = mostOfOnePlay();

// MOST_OF_ONE_PLAY is a fixed count, so a failed Result is a defect of the code.
function mostOfOnePlay(): Stars {
  const most = Stars.ofIncoming(MOST_OF_ONE_PLAY);
  if (!most.ok) {
    throw new RangeError(`The most stars of one play break the rule ${most.error}.`);
  }
  return most.value;
}
