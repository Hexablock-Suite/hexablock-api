import type { ValueReceiver } from '../shared/value-receiver.js';

// Value object for the rank of one row of a leaderboard board. The rank is
// 1 plus the number of rows of the board that are strictly better, so a full
// tie shares a rank and the next rank skips: 1, 1, 3 (decision of #83).
// RankedBoard.of() is the only producer and the count of its rows cannot
// break a rule, so the factory cannot fail and takes the number as it is.
export class Rank {
  private constructor(private readonly value: number) {}

  static of(value: number): Rank {
    return new Rank(value);
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }
}
