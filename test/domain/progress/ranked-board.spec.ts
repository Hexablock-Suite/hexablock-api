import { ElapsedTime } from '../../../src/domain/progress/elapsed-time.js';
import type { LevelResult } from '../../../src/domain/progress/level-result.js';
import { LevelsCompleted } from '../../../src/domain/progress/levels-completed.js';
import { Moves } from '../../../src/domain/progress/moves.js';
import { RankedBoard } from '../../../src/domain/progress/ranked-board.js';
import { Score } from '../../../src/domain/progress/score.js';
import { Standing } from '../../../src/domain/progress/standing.js';
import { Stars } from '../../../src/domain/progress/stars.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { Username } from '../../../src/domain/user/username.js';
import { levelResultOf } from '../../support/level-results.js';
import { valueOf } from '../../support/result.js';
import { testUserId } from '../../support/user-ids.js';

function player(n: number): UserId {
  return valueOf(UserId.from(testUserId(n)));
}

// The username of player n. The tests give each player one name.
function username(n: number): Username {
  return valueOf(Username.create(`player${n}`));
}

function score(n: number): Score {
  return valueOf(Score.of(n));
}

function levelResult(stars: number, moves: number, elapsedMs: number): LevelResult {
  return levelResultOf({ levelId: 'fit-01', stars, moves, elapsedMs });
}

function standing(stars: number, levels: number, moves: number, elapsedMs: number): Standing {
  const built = Standing.of(
    valueOf(Stars.of(stars)),
    valueOf(LevelsCompleted.of(levels)),
    valueOf(Moves.of(moves)),
    valueOf(ElapsedTime.ofMs(elapsedMs)),
  );
  if (!built.ok) throw new Error(built.error);
  return built.value;
}

// Runs one delivery of the board and gives each row as plain values, in the
// order of the delivery. The rank, the userId and the username leave through
// their own deliveries, so the test reads the board as the border does.
function rowsOf<TResult extends { isBetterThan(other: TResult): boolean }>(
  board: RankedBoard<TResult>,
) {
  const rows: { rank: number; userId: string; username: string; result: TResult }[] = [];
  board.deliverTo({
    receive(rank, userId, name, result) {
      rows.push({
        rank: delivered(rank),
        userId: delivered(userId),
        username: delivered(name),
        result,
      });
    },
  });
  return rows;
}

// Delivers the value of a value object to a local receiver.
function delivered<T>(source: { deliverTo(receiver: { receive(value: T): void }): void }): T {
  const kept: T[] = [];
  source.deliverTo({
    receive(value) {
      kept.push(value);
    },
  });
  if (kept.length !== 1) throw new Error(`The delivery happened ${kept.length} times.`);
  return kept[0];
}

describe('RankedBoard', () => {
  // The higher score wins (S3-03). The userId order differs from the board
  // order, so the tie order cannot make the test pass.
  it('should_rank_the_board_by_the_comparison_of_the_result_when_the_entries_come_in_no_order', () => {
    const low = score(80);
    const high = score(2048);
    const middle = score(120);

    const board = RankedBoard.of([
      { userId: player(1), username: username(1), result: low },
      { userId: player(2), username: username(2), result: high },
      { userId: player(3), username: username(3), result: middle },
    ]);

    expect(rowsOf(board)).toEqual([
      { rank: 1, userId: testUserId(2), username: 'player2', result: high },
      { rank: 2, userId: testUserId(3), username: 'player3', result: middle },
      { rank: 3, userId: testUserId(1), username: 'player1', result: low },
    ]);
  });

  // DS-4: more stars wins, then fewer moves, then less time. The
  // PlayerProgress spec pins each step through the root, so these entries
  // differ only in stars.
  it('should_rank_the_board_by_the_level_result_comparison_when_the_entries_come_in_no_order', () => {
    const threeStars = levelResult(3, 10, 40_000);
    const twoStars = levelResult(2, 10, 40_000);
    const oneStar = levelResult(1, 10, 40_000);
    const noStars = levelResult(0, 10, 40_000);

    const board = RankedBoard.of([
      { userId: player(4), username: username(4), result: twoStars },
      { userId: player(3), username: username(3), result: noStars },
      { userId: player(1), username: username(1), result: oneStar },
      { userId: player(2), username: username(2), result: threeStars },
    ]);

    expect(rowsOf(board)).toEqual([
      { rank: 1, userId: testUserId(2), username: 'player2', result: threeStars },
      { rank: 2, userId: testUserId(4), username: 'player4', result: twoStars },
      { rank: 3, userId: testUserId(1), username: 'player1', result: oneStar },
      { rank: 4, userId: testUserId(3), username: 'player3', result: noStars },
    ]);
  });

  // S3-03: more stars, then more levels completed, then fewer moves, then
  // less time. The Standing spec pins each step, so each pair differs in
  // exactly one total.
  it('should_rank_the_board_by_the_standing_comparison_when_the_entries_come_in_no_order', () => {
    const lessTime = standing(9, 3, 40, 90_000);
    const moreTime = standing(9, 3, 40, 95_000);
    const moreMoves = standing(9, 3, 41, 10_000);
    const fewerLevels = standing(9, 2, 20, 10_000);
    const fewerStars = standing(8, 4, 10, 10_000);

    const board = RankedBoard.of([
      { userId: player(4), username: username(4), result: fewerLevels },
      { userId: player(3), username: username(3), result: moreMoves },
      { userId: player(5), username: username(5), result: fewerStars },
      { userId: player(1), username: username(1), result: lessTime },
      { userId: player(2), username: username(2), result: moreTime },
    ]);

    expect(rowsOf(board)).toEqual([
      { rank: 1, userId: testUserId(1), username: 'player1', result: lessTime },
      { rank: 2, userId: testUserId(2), username: 'player2', result: moreTime },
      { rank: 3, userId: testUserId(3), username: 'player3', result: moreMoves },
      { rank: 4, userId: testUserId(4), username: 'player4', result: fewerLevels },
      { rank: 5, userId: testUserId(5), username: 'player5', result: fewerStars },
    ]);
  });

  // A full tie ranks neither player first. The tied rows share a rank, and
  // the next rank skips: 1, 1, 3 (decision of #83). Each board of the game
  // ranks with the comparison of its own value object.
  it('should_share_a_rank_and_skip_the_next_rank_when_two_entries_tie_fully', () => {
    const levelTieA = levelResult(3, 10, 40_000);
    const levelTieB = levelResult(3, 10, 40_000);
    const levelLast = levelResult(1, 10, 40_000);
    const scoreTieA = score(120);
    const scoreTieB = score(120);
    const scoreLast = score(80);
    const standingFirst = standing(9, 3, 40, 90_000);
    const standingTieA = standing(5, 2, 20, 50_000);
    const standingTieB = standing(5, 2, 20, 50_000);

    const levelBoard = RankedBoard.of([
      { userId: player(3), username: username(3), result: levelLast },
      { userId: player(2), username: username(2), result: levelTieB },
      { userId: player(1), username: username(1), result: levelTieA },
    ]);
    const scoreBoard = RankedBoard.of([
      { userId: player(3), username: username(3), result: scoreLast },
      { userId: player(2), username: username(2), result: scoreTieB },
      { userId: player(1), username: username(1), result: scoreTieA },
    ]);
    const standingBoard = RankedBoard.of([
      { userId: player(3), username: username(3), result: standingTieB },
      { userId: player(2), username: username(2), result: standingTieA },
      { userId: player(1), username: username(1), result: standingFirst },
    ]);

    expect(rowsOf(levelBoard)).toEqual([
      { rank: 1, userId: testUserId(1), username: 'player1', result: levelTieA },
      { rank: 1, userId: testUserId(2), username: 'player2', result: levelTieB },
      { rank: 3, userId: testUserId(3), username: 'player3', result: levelLast },
    ]);
    expect(rowsOf(scoreBoard)).toEqual([
      { rank: 1, userId: testUserId(1), username: 'player1', result: scoreTieA },
      { rank: 1, userId: testUserId(2), username: 'player2', result: scoreTieB },
      { rank: 3, userId: testUserId(3), username: 'player3', result: scoreLast },
    ]);
    expect(rowsOf(standingBoard)).toEqual([
      { rank: 1, userId: testUserId(1), username: 'player1', result: standingFirst },
      { rank: 2, userId: testUserId(2), username: 'player2', result: standingTieA },
      { rank: 2, userId: testUserId(3), username: 'player3', result: standingTieB },
    ]);
  });

  // Equal entries come out in one fixed order: userId ascending.
  it('should_list_full_ties_by_user_id_ascending_when_the_entries_come_in_another_order', () => {
    const tied = [4, 2, 3, 1].map((n) => ({
      userId: player(n),
      username: username(n),
      result: score(500),
    }));

    const board = RankedBoard.of(tied);

    expect(rowsOf(board)).toEqual(
      [1, 2, 3, 4].map((n) => ({
        rank: 1,
        userId: testUserId(n),
        username: `player${n}`,
        result: score(500),
      })),
    );
  });

  // A board lists only the players who have a result to rank (decision of
  // #82). An empty board is a board, not a failure.
  it('should_give_an_empty_board_when_no_entry_comes', () => {
    const board = RankedBoard.of([]);

    expect(rowsOf(board)).toEqual([]);
  });

  // The board delivers its rows, one call per row, in board order: the rank,
  // the userId, the username and the value that ranks the player in every
  // call.
  it('should_deliver_each_row_once_in_board_order_when_the_board_holds_rows', () => {
    const high = score(2048);
    const low = score(80);

    const board = RankedBoard.of([
      { userId: player(1), username: username(1), result: low },
      { userId: player(2), username: username(2), result: high },
    ]);

    const calls: { rank: number; userId: string; username: string; result: Score }[] = [];
    board.deliverTo({
      receive(rank, userId, name, result) {
        calls.push({
          rank: delivered(rank),
          userId: delivered(userId),
          username: delivered(name),
          result,
        });
      },
    });

    expect(calls).toEqual([
      { rank: 1, userId: testUserId(2), username: 'player2', result: high },
      { rank: 2, userId: testUserId(1), username: 'player1', result: low },
    ]);
  });

  // #230: each row carries the Username of its entry, the name that the
  // player typed at sign-up. The board keeps the name with its player when
  // it sorts the entries, so the name of a row is never the name of another
  // row.
  it('should_deliver_the_username_of_each_entry_when_the_board_ranks_the_entries', () => {
    const board = RankedBoard.of([
      { userId: player(1), username: valueOf(Username.create('ada')), result: score(80) },
      { userId: player(2), username: valueOf(Username.create('Grace.H')), result: score(2048) },
    ]);

    expect(rowsOf(board).map(({ userId, username }) => ({ userId, username }))).toEqual([
      { userId: testUserId(2), username: 'Grace.H' },
      { userId: testUserId(1), username: 'ada' },
    ]);
  });
});
