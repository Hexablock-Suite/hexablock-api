import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The code of the broken rule. The border writes the message (decision 11).
export type RankProblem = 'invalid-rank';

// Value object for the rank of one row of a leaderboard board. The rank is
// 1 plus the number of rows of the board that are strictly better, so a full
// tie shares a rank and the next rank skips: 1, 1, 3 (decision of #83).
// The rule of a rank is a whole number of 1 or more. The factory is public,
// so the value object guards the rule itself. A number that breaks the rule
// gives a failed Result, as the factory of every value object does
// (decision 11). The team chose this option on #195 (option B).
export class Rank {
  private constructor(private readonly value: number) {}

  static of(value: number): Result<Rank, RankProblem> {
    return Number.isSafeInteger(value) && value >= 1 ? ok(new Rank(value)) : err('invalid-rank');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }
}
