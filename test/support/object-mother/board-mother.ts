import { ElapsedTime } from '../../../src/domain/shared/elapsed-time.js';
import { LevelsCompleted } from '../../../src/domain/progress/levels-completed.js';
import type { LevelResult } from '../../../src/domain/progress/level-result.js';
import { Moves } from '../../../src/domain/shared/moves.js';
import type { BoardEntry } from '../../../src/domain/progress/ranked-board.js';
import { Score } from '../../../src/domain/progress/score.js';
import { Standing } from '../../../src/domain/progress/standing.js';
import { Stars } from '../../../src/domain/shared/stars.js';
import { Username } from '../../../src/domain/shared/username.js';
import { valueOf } from '../result.js';
import { ProgressMother } from './progress-mother.js';
import { UserMother } from './user-mother.js';

// One row of the board of a level as a test names it: the player n and the
// values of the result of the level LEVEL_ID.
export interface LevelRow {
  readonly player: number;
  readonly stars: number;
  readonly moves: number;
  readonly elapsedMs: number;
}

// One row of the high scores of a game as a test names it.
export interface ScoreRow {
  readonly player: number;
  readonly score: number;
}

// One row of the standings of a game as a test names it. A row that names
// no moves has 10 moves, and a row that names no time has 40 seconds.
export interface StandingRow {
  readonly player: number;
  readonly stars: number;
  readonly levels: number;
  readonly moves?: number;
  readonly elapsedMs?: number;
}

// The four totals of a standing row as plain numbers.
export interface StandingTotals {
  readonly stars: number;
  readonly levels: number;
  readonly moves: number;
  readonly elapsedMs: number;
}

// One row of a ranked board as a test states it: the rank that the test
// expects and the row of the player.
export type Ranked<TRow> = { readonly rank: number } & TRow;

// Object Mother of the leaderboard data of the tests. It builds domain values
// with the public factories only, and it knows no test double.
export class BoardMother {
  // The level of every row of the board of a level.
  static readonly LEVEL_ID = 'fit-01';

  // The name of player n as text. The tests give each player one name (#230).
  static usernameText(n: number): string {
    return `player${n}`;
  }

  // The username of player n.
  static username(n: number): Username {
    return valueOf(Username.create(BoardMother.usernameText(n)));
  }

  // The totals of a standing row, with the moves and the time of a row that
  // names none.
  static standingTotals(row: StandingRow): StandingTotals {
    return {
      stars: row.stars,
      levels: row.levels,
      moves: row.moves ?? 10,
      elapsedMs: row.elapsedMs ?? 40_000,
    };
  }

  static levelEntry(row: LevelRow): BoardEntry<LevelResult> {
    const { player, ...values } = row;
    return BoardMother.entry(
      player,
      ProgressMother.levelResult({ levelId: BoardMother.LEVEL_ID, ...values }),
    );
  }

  static scoreEntry(row: ScoreRow): BoardEntry<Score> {
    return BoardMother.entry(row.player, valueOf(Score.of(row.score)));
  }

  static standingEntry(row: StandingRow): BoardEntry<Standing> {
    const totals = BoardMother.standingTotals(row);
    return BoardMother.entry(
      row.player,
      valueOf(
        Standing.of(
          valueOf(Stars.of(totals.stars)),
          valueOf(LevelsCompleted.of(totals.levels)),
          valueOf(Moves.of(totals.moves)),
          valueOf(ElapsedTime.ofMs(totals.elapsedMs)),
        ),
      ),
    );
  }

  private static entry<T>(player: number, result: T): BoardEntry<T> {
    return { userId: UserMother.id(player), username: BoardMother.username(player), result };
  }
}
