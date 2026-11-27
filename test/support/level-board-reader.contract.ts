import type { LevelBoardReader } from '../../src/application/ports/level-board-reader.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { LevelId } from '../../src/domain/progress/level-id.js';
import { levelResultOf } from './level-results.js';
import { byPlayer, namesOf, type PlayedProgress } from './played-progress.js';
import { testUserId } from './user-ids.js';
import { valueOf } from './result.js';

const ADA = testUserId(1);
const GRACE = testUserId(2);
const LINUS = testUserId(3);
const FIT = valueOf(GameId.of('fit'));
const SORT = valueOf(GameId.of('sort'));
const LEVEL_01 = valueOf(LevelId.of('level-01'));

function level(levelId: string, stars: number, moves: number, elapsedMs: number) {
  return levelResultOf({ levelId, stars, moves, elapsedMs });
}

// Contract of the LevelBoardReader port (API-FR-03): it reads the board of
// one level of one game, filters by gameId and by level, and adds no order.
// Each adapter of the port runs the same cases (#218). createReader stores
// the given progresses and gives a reader over them and nothing else.
export function describeLevelBoardReaderContract(
  name: string,
  createReader: (played: readonly PlayedProgress[]) => Promise<LevelBoardReader>,
): void {
  describe(`LevelBoardReader contract: ${name}`, () => {
    it('should_give_the_stored_result_of_each_player_when_the_board_of_one_level_is_read', async () => {
      const reader = await createReader([
        {
          userId: ADA,
          gameId: FIT,
          results: [level('level-01', 3, 12, 40_000), level('level-02', 2, 20, 60_000)],
        },
        { userId: GRACE, gameId: FIT, results: [level('level-01', 1, 30, 90_000)] },
        { userId: LINUS, gameId: FIT, score: 0 },
        { userId: LINUS, gameId: SORT, results: [level('level-01', 3, 5, 1_000)] },
      ]);

      const board = await reader.levelResults(FIT, LEVEL_01);

      expect(byPlayer(board)).toEqual([
        { userId: ADA, result: level('level-01', 3, 12, 40_000) },
        { userId: GRACE, result: level('level-01', 1, 30, 90_000) },
      ]);
    });

    // #230: each entry of the board carries the Username of the account of
    // its player, as the player typed it at sign-up.
    it('should_give_the_username_of_the_account_of_each_player_when_the_board_of_one_level_is_read', async () => {
      const reader = await createReader([
        { userId: ADA, username: 'Ada', gameId: FIT, results: [level('level-01', 3, 12, 40_000)] },
        {
          userId: GRACE,
          username: 'grace.h',
          gameId: FIT,
          results: [level('level-01', 1, 30, 90_000)],
        },
      ]);

      const board = await reader.levelResults(FIT, LEVEL_01);

      expect(namesOf(board)).toEqual([
        { userId: ADA, username: 'Ada' },
        { userId: GRACE, username: 'grace.h' },
      ]);
    });

    // A board lists only the players who have a stored result of the level
    // (decision of #82). A result of another level or of another game does
    // not count.
    it('should_give_an_empty_board_when_no_player_has_a_result_for_the_level', async () => {
      const reader = await createReader([
        { userId: ADA, gameId: FIT, results: [level('level-02', 2, 20, 60_000)] },
        { userId: GRACE, gameId: SORT, results: [level('level-01', 3, 5, 1_000)] },
      ]);

      const board = await reader.levelResults(FIT, LEVEL_01);

      expect(board).toEqual([]);
    });
  });
}
