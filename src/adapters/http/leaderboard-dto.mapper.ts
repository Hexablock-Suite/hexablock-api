import type {
  Leaderboard,
  LeaderboardQuery,
} from '../../application/leaderboard/get-leaderboard.use-case.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import type { RankedBoard } from '../../domain/progress/ranked-board.js';
import type { Score } from '../../domain/progress/score.js';
import type { Standing } from '../../domain/progress/standing.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import { receiveLevelResultOf, receiveValueOf } from '../received.js';
import type {
  LeaderboardDto,
  LevelEntryDto,
  ScoreEntryDto,
  StandingEntryDto,
} from './leaderboard.dto.js';
import { gameIdFrom, levelIdFrom } from './progress-values.js';

// Translates between the leaderboard routes and GetLeaderboard (decision 12).
// The controller holds no translation code. The mapper builds the domain
// values of each query, so the use case gets them built. A value that breaks
// its rule gives the text of the rule as the one problem: the factory gives
// the code, and progress-values.ts writes the text.
export const LeaderboardDtoMapper = {
  // The gameId of a global board comes from the path.
  toGlobalQuery(gameId: string): Result<LeaderboardQuery, string[]> {
    const built = gameIdFrom(gameId);
    return built.ok ? ok({ board: 'global', gameId: built.value }) : err([built.error]);
  },

  // The gameId and the levelId of a level board come from the path. The
  // values are built in one order: the gameId, then the levelId.
  toLevelQuery(gameId: string, levelId: string): Result<LeaderboardQuery, string[]> {
    const builtGameId = gameIdFrom(gameId);
    if (!builtGameId.ok) return err([builtGameId.error]);
    const builtLevelId = levelIdFrom(levelId);
    if (!builtLevelId.ok) return err([builtLevelId.error]);
    return ok({ board: 'level', gameId: builtGameId.value, levelId: builtLevelId.value });
  },

  // The mapper receives the values that the board and each value object
  // deliver. The board delivers its rows in the order that the domain gave,
  // and each rank delivers its number.
  toDto(board: Leaderboard): LeaderboardDto {
    const gameId = receiveValueOf(board.gameId);
    if (board.board === 'level') {
      return { gameId, levelId: receiveValueOf(board.levelId), entries: levelRows(board.entries) };
    }
    return {
      gameId,
      highScores: scoreRows(board.highScores),
      standings: standingRows(board.standings),
    };
  },
};

// A LevelResult delivers its four values in one call. The row of a level
// board leaves out the levelId: the board names it once.
function levelRows(board: RankedBoard<LevelResult>): LevelEntryDto[] {
  const rows: LevelEntryDto[] = [];
  board.deliverTo({
    receive(rank, userId, result) {
      const { stars, moves, elapsedMs } = receiveLevelResultOf(result);
      rows.push({
        rank: receiveValueOf(rank),
        userId: receiveValueOf(userId),
        stars,
        moves,
        elapsedMs,
      });
    },
  });
  return rows;
}

function scoreRows(board: RankedBoard<Score>): ScoreEntryDto[] {
  const rows: ScoreEntryDto[] = [];
  board.deliverTo({
    receive(rank, userId, result) {
      rows.push({
        rank: receiveValueOf(rank),
        userId: receiveValueOf(userId),
        highScore: receiveValueOf(result),
      });
    },
  });
  return rows;
}

// A Standing delivers its four totals in one call.
function standingRows(board: RankedBoard<Standing>): StandingEntryDto[] {
  const rows: StandingEntryDto[] = [];
  board.deliverTo({
    receive(rank, userId, result) {
      const before = rows.length;
      result.deliverTo({
        receive(stars, levelsCompleted, moves, elapsedTime) {
          rows.push({
            rank: receiveValueOf(rank),
            userId: receiveValueOf(userId),
            stars: receiveValueOf(stars),
            levelsCompleted: receiveValueOf(levelsCompleted),
            moves: receiveValueOf(moves),
            elapsedMs: receiveValueOf(elapsedTime),
          });
        },
      });
      // A Standing that delivers nothing breaks its contract.
      if (rows.length === before) {
        throw new Error('The Standing delivered no totals.');
      }
    },
  });
  return rows;
}
