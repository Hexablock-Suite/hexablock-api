import { Rank } from './rank.js';
import type { UserId } from '../user/user-id.js';

// The receiver of the rows of a RankedBoard. RankedBoard.deliverTo() calls it
// once per row, in board order. Only the border implements it, for example a
// DTO mapper.
export interface RankedBoardReceiver<T> {
  receive(rank: Rank, userId: UserId, result: T): void;
}

// One entry of a board: the player and the value that ranks the player.
// RankedBoard.of() takes these entries, and the LeaderboardEntry type of
// layer 2 is an alias of this type, so the shape has one declaration (#213).
// It is a type alias, as Result is: it only carries the two values that the
// factory reads, and no rule of its own.
export type BoardEntry<T> = { readonly userId: UserId; readonly result: T };

// One row of the board, as the factory of the board keeps it: an entry and
// its rank.
interface Row<T> extends BoardEntry<T> {
  readonly rank: Rank;
}

// The ranked board of one leaderboard. The domain owns the order: the
// factory sorts the entries with the comparison of the value object of the
// board (DS-4, S3-03) and gives each row its rank, 1 plus the number of rows
// that are strictly better. So a full tie shares a rank, and the next rank
// skips: 1, 1, 3 (decision of #83). When neither entry beats the other, the
// tie is full, and the entries come out by userId ascending, so the board
// has one fixed order. A reader port only filters and sums; the use case
// holds the board that this factory builds and orders nothing, and the
// adapter adds no order (classes.md decision 2).
export class RankedBoard<T extends { isBetterThan(other: T): boolean }> {
  private constructor(private readonly rows: readonly Row<T>[]) {}

  // The entries name the player and hold the value that ranks the player.
  // The factory takes them built and keeps its own copy, so the caller
  // cannot change the board afterwards.
  static of<T extends { isBetterThan(other: T): boolean }>(
    entries: readonly BoardEntry<T>[],
  ): RankedBoard<T> {
    const ordered = entries.toSorted((one, other) => {
      if (one.result.isBetterThan(other.result)) return -1;
      if (other.result.isBetterThan(one.result)) return 1;
      if (one.userId.comesBefore(other.userId)) return -1;
      return other.userId.comesBefore(one.userId) ? 1 : 0;
    });
    const rows: Row<T>[] = [];
    for (const [index, { userId, result }] of ordered.entries()) {
      const previous = rows.at(-1);
      const rank =
        previous !== undefined && !previous.result.isBetterThan(result)
          ? previous.rank
          : rankAt(index + 1);
      rows.push({ rank, userId, result });
    }
    return new RankedBoard(rows);
  }

  // Delivers the rows to a receiver of the border, in board order, one call
  // per row. No operation returns them.
  deliverTo(receiver: RankedBoardReceiver<T>): void {
    for (const { rank, userId, result } of this.rows) {
      receiver.receive(rank, userId, result);
    }
  }
}

// The factory of the board passes the position of a row, index + 1, which is
// always a whole number of 1 or more. So a failed Result is a defect of the
// code (#195).
function rankAt(position: number): Rank {
  const rank = Rank.of(position);
  if (!rank.ok) {
    throw new RangeError(`The position ${position} of a row breaks the rule ${rank.error}.`);
  }
  return rank.value;
}
