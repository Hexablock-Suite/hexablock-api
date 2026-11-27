import type { GlobalBoardReader } from '../../src/application/ports/global-board-reader.js';
import { ElapsedTime } from '../../src/domain/progress/elapsed-time.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { LevelsCompleted } from '../../src/domain/progress/levels-completed.js';
import { Moves } from '../../src/domain/progress/moves.js';
import { Score } from '../../src/domain/progress/score.js';
import { Standing } from '../../src/domain/progress/standing.js';
import { Stars } from '../../src/domain/progress/stars.js';
import { levelResultOf } from './level-results.js';
import { byPlayer, type PlayedProgress } from './played-progress.js';
import { testUserId } from './user-ids.js';
import { valueOf } from './result.js';

const ADA = testUserId(1);
const GRACE = testUserId(2);
const LINUS = testUserId(3);
const FIT = valueOf(GameId.of('fit'));
const SORT = valueOf(GameId.of('sort'));
const LINES = valueOf(GameId.of('lines'));
const MERGE = valueOf(GameId.of('merge'));

function level(levelId: string, stars: number, moves: number, elapsedMs: number) {
  return levelResultOf({ levelId, stars, moves, elapsedMs });
}

function standing(stars: number, levels: number, moves: number, elapsedMs: number): Standing {
  return valueOf(
    Standing.of(
      valueOf(Stars.of(stars)),
      valueOf(LevelsCompleted.of(levels)),
      valueOf(Moves.of(moves)),
      valueOf(ElapsedTime.ofMs(elapsedMs)),
    ),
  );
}

// Contract of the GlobalBoardReader port (API-FR-03): it reads the two
// global boards of one game, filters by gameId and sums, and adds no order.
// Each adapter of the port runs the same cases (#218). createReader stores
// the given progresses and gives a reader over them and nothing else.
export function describeGlobalBoardReaderContract(
  name: string,
  createReader: (played: readonly PlayedProgress[]) => Promise<GlobalBoardReader>,
): void {
  describe(`GlobalBoardReader contract: ${name}`, () => {
    it('should_give_the_high_score_of_each_player_who_has_one_when_the_high_scores_of_one_game_are_read', async () => {
      const reader = await createReader([
        { userId: ADA, gameId: LINES, score: 500 },
        { userId: GRACE, gameId: LINES, score: 700 },
        { userId: LINUS, gameId: LINES },
        { userId: LINUS, gameId: MERGE, score: 300 },
      ]);

      const board = await reader.highScores(LINES);

      expect(byPlayer(board)).toEqual([
        { userId: ADA, result: valueOf(Score.of(500)) },
        { userId: GRACE, result: valueOf(Score.of(700)) },
      ]);
    });

    // S3-03: the global board of Fit and Sort sums the stored results of
    // each player. It reads no high score: Fit gives no points per turn.
    it('should_sum_the_level_results_of_each_player_when_the_standings_of_one_game_are_read', async () => {
      const reader = await createReader([
        {
          userId: ADA,
          gameId: FIT,
          score: 900,
          results: [level('level-01', 3, 12, 40_000), level('level-02', 2, 20, 60_000)],
        },
        { userId: GRACE, gameId: FIT, results: [level('level-01', 1, 30, 90_000)] },
        { userId: LINUS, gameId: FIT, score: 0 },
        { userId: LINUS, gameId: SORT, results: [level('level-01', 3, 5, 1_000)] },
      ]);

      const board = await reader.standings(FIT);

      expect(byPlayer(board)).toEqual([
        { userId: ADA, result: standing(5, 2, 32, 100_000) },
        { userId: GRACE, result: standing(1, 1, 30, 90_000) },
      ]);
    });

    // A board lists only the players who have something to rank (decision
    // of #82). A game with no high score and no level result gives two
    // empty boards.
    it('should_give_empty_boards_when_no_player_of_the_game_has_a_result', async () => {
      const reader = await createReader([
        { userId: ADA, gameId: LINES },
        { userId: GRACE, gameId: MERGE, score: 300 },
        { userId: LINUS, gameId: SORT, results: [level('level-01', 3, 5, 1_000)] },
      ]);

      const highScores = await reader.highScores(LINES);
      const standings = await reader.standings(LINES);

      expect(highScores).toEqual([]);
      expect(standings).toEqual([]);
    });
  });
}
