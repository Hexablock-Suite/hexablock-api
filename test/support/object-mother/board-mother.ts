import { ElapsedTime } from '../../../src/domain/progress/elapsed-time.js';
import { LevelsCompleted } from '../../../src/domain/progress/levels-completed.js';
import type { LevelResult } from '../../../src/domain/progress/level-result.js';
import { Moves } from '../../../src/domain/progress/moves.js';
import type { BoardEntry } from '../../../src/domain/progress/ranked-board.js';
import { Score } from '../../../src/domain/progress/score.js';
import { Standing } from '../../../src/domain/progress/standing.js';
import { Stars } from '../../../src/domain/progress/stars.js';
import { Username } from '../../../src/domain/user/username.js';
import { valueOf } from '../result.js';
import { ProgressMother } from './progress-mother.js';
import { UserMother } from './user-mother.js';

// One row of the board of a level as a test names it: the player n and the
// values of the result of the level fit-01.
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

// One row of the standings of a game as a test names it. Every standing has
// 10 moves and 40 seconds.
export interface StandingRow {
  readonly player: number;
  readonly stars: number;
  readonly levels: number;
}

// Object Mother of the leaderboard data of the tests. It builds domain values
// with the public factories only, and it knows no test double.
export class BoardMother {
  // The username of player n. The tests give each player one name (#230).
  static username(n: number): Username {
    return valueOf(Username.create(`player${n}`));
  }

  static levelEntry(row: LevelRow): BoardEntry<LevelResult> {
    const { player, ...values } = row;
    return BoardMother.entry(player, ProgressMother.levelResult({ levelId: 'fit-01', ...values }));
  }

  static scoreEntry(row: ScoreRow): BoardEntry<Score> {
    return BoardMother.entry(row.player, valueOf(Score.of(row.score)));
  }

  static standingEntry(row: StandingRow): BoardEntry<Standing> {
    return BoardMother.entry(
      row.player,
      valueOf(
        Standing.of(
          valueOf(Stars.of(row.stars)),
          valueOf(LevelsCompleted.of(row.levels)),
          valueOf(Moves.of(10)),
          valueOf(ElapsedTime.ofMs(40_000)),
        ),
      ),
    );
  }

  private static entry<T>(player: number, result: T): BoardEntry<T> {
    return { userId: UserMother.id(player), username: BoardMother.username(player), result };
  }
}
