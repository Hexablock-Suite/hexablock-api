import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The code of the broken rule. The border writes the message (decision 11).
export type MovesProblem = 'invalid-moves';

// The most moves of one play that a client can send: the largest value of
// the Postgres integer column level_results.moves (#135).
const MOST_OF_ONE_PLAY = 2_147_483_647;

// Value object for the moves that a player uses in one level, for a total of
// moves, or for the move limit of a star threshold. It is a non-negative
// safe integer.
export class Moves {
  private constructor(private readonly value: number) {}

  // Builds the moves of a value that the API already holds or reads from a
  // level: a stored row, a total that sums the stored rows, or a star
  // threshold. A total can exceed one column, and a stored row keeps what it
  // holds, so this factory has no upper bound.
  static of(value: number): Result<Moves, MovesProblem> {
    return Number.isSafeInteger(value) && value >= 0 ? ok(new Moves(value)) : err('invalid-moves');
  }

  // Builds the moves of one play that a client sends. They must also fit the
  // column that stores them, so a value over MOST_OF_ONE_PLAY stops at the
  // border with invalid-moves (#135).
  static ofIncoming(value: number): Result<Moves, MovesProblem> {
    const moves = Moves.of(value);
    return moves.ok && value <= MOST_OF_ONE_PLAY ? moves : err('invalid-moves');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }

  equals(other: Moves): boolean {
    return this.value === other.value;
  }

  // Fewer moves is the better result (DS-4). An equal count is not fewer.
  isFewerThan(other: Moves): boolean {
    return this.value < other.value;
  }
}

// The most moves of one play. The border receives it for the OpenAPI limit
// and the message of the rule, so the number has one home.
export const MOST_MOVES_OF_ONE_PLAY: Moves = mostOfOnePlay();

// MOST_OF_ONE_PLAY is a fixed count, so a failed Result is a defect of the code.
function mostOfOnePlay(): Moves {
  const most = Moves.ofIncoming(MOST_OF_ONE_PLAY);
  if (!most.ok) {
    throw new RangeError(`The most moves of one play break the rule ${most.error}.`);
  }
  return most.value;
}
