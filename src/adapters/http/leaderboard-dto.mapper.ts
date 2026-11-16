import type {
  Leaderboard,
  LeaderboardQuery,
  RankedEntry,
} from '../../application/leaderboard/get-leaderboard.use-case.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
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

  // The mapper receives the value that each value object delivers. It keeps
  // the order and the rank that the use case gave.
  toDto(board: Leaderboard): LeaderboardDto {
    const gameId = receiveValueOf(board.gameId);
    if (board.board === 'level') {
      return {
        gameId,
        levelId: receiveValueOf(board.levelId),
        entries: board.entries.map(levelRow),
      };
    }
    return {
      gameId,
      highScores: board.highScores.map(scoreRow),
      standings: board.standings.map(standingRow),
    };
  },
};

// A LevelResult delivers its four values in one call. The row of a level
// board leaves out the levelId: the board names it once.
function levelRow({ rank, userId, result }: RankedEntry<LevelResult>): LevelEntryDto {
  const { stars, moves, elapsedMs } = receiveLevelResultOf(result);
  return { rank, userId: receiveValueOf(userId), stars, moves, elapsedMs };
}

function scoreRow({ rank, userId, result }: RankedEntry<Score>): ScoreEntryDto {
  return { rank, userId: receiveValueOf(userId), highScore: receiveValueOf(result) };
}

// A Standing delivers its four totals in one call.
function standingRow({ rank, userId, result }: RankedEntry<Standing>): StandingEntryDto {
  const rows: StandingEntryDto[] = [];
  result.deliverTo({
    receive(stars, levelsCompleted, moves, elapsedTime) {
      rows.push({
        rank,
        userId: receiveValueOf(userId),
        stars: receiveValueOf(stars),
        levelsCompleted: receiveValueOf(levelsCompleted),
        moves: receiveValueOf(moves),
        elapsedMs: receiveValueOf(elapsedTime),
      });
    },
  });
  const [row] = rows;
  // A Standing that delivers nothing breaks its contract.
  if (row === undefined) {
    throw new Error('The Standing delivered no totals.');
  }
  return row;
}
