import { and, eq, getTableColumns, isNotNull, sql } from 'drizzle-orm';
import type { LeaderboardEntry } from '../../application/ports/leaderboard-entry.js';
import type { GlobalBoardReader } from '../../application/ports/global-board-reader.js';
import type { LevelBoardReader } from '../../application/ports/level-board-reader.js';
import { ElapsedTime } from '../../domain/shared/elapsed-time.js';
import type { GameId } from '../../domain/shared/game-id.js';
import type { LevelId } from '../../domain/shared/level-id.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import { LevelsCompleted } from '../../domain/progress/levels-completed.js';
import { Moves } from '../../domain/shared/moves.js';
import { Score } from '../../domain/progress/score.js';
import { Standing } from '../../domain/progress/standing.js';
import { Stars } from '../../domain/shared/stars.js';
import { UserId } from '../../domain/shared/user-id.js';
import { Username } from '../../domain/shared/username.js';
import { buildLevelResult } from '../built.js';
import { receiveValueOf } from '../received.js';
import type { PersistenceDatabase } from './drizzle-user-repository.js';
import { levelResults, progress, users } from './schema.js';
import { storedValue } from './stored-value.js';

// Adapter of the GlobalBoardReader and LevelBoardReader ports over the
// progress and level_results tables of DS-5 (API-FR-03). One class serves
// both ports, because both read the same tables (#218). Each read joins the
// users table on the userId of a row and reads only its username column, so
// each entry names the account of the player (#230). Every progress row
// refers to a users row, so the join drops no row. It filters by gameId and
// by level, and it sums the totals of a standing. It adds no order: the use
// case orders the entries with the comparisons of the domain (classes.md
// decision 2). A stored value that breaks a rule of the domain is a server
// fault, so the reader throws.
export class DrizzleLeaderboardReader implements GlobalBoardReader, LevelBoardReader {
  constructor(private readonly db: PersistenceDatabase) {}

  async levelResults(gameId: GameId, levelId: LevelId): Promise<LeaderboardEntry<LevelResult>[]> {
    const rows = await this.db
      .select({ ...getTableColumns(levelResults), username: users.username })
      .from(levelResults)
      .innerJoin(users, eq(users.id, levelResults.userId))
      .where(
        and(
          eq(levelResults.gameId, receiveValueOf(gameId)),
          eq(levelResults.levelId, receiveValueOf(levelId)),
        ),
      );
    // The reader builds the four value objects of each stored result.
    return rows.map((row) => {
      const stored = rowsOf('level_results', row.userId);
      return {
        userId: storedValue(UserId.from(row.userId), stored),
        username: usernameOf(row.userId, row.username),
        result: storedValue(buildLevelResult(row), stored),
      };
    });
  }

  async highScores(gameId: GameId): Promise<LeaderboardEntry<Score>[]> {
    const rows = await this.db
      .select({
        userId: progress.userId,
        username: users.username,
        highScore: progress.highScore,
      })
      .from(progress)
      .innerJoin(users, eq(users.id, progress.userId))
      .where(and(eq(progress.gameId, receiveValueOf(gameId)), isNotNull(progress.highScore)));
    // The where clause keeps no null. The check only narrows the type.
    return rows.flatMap(({ userId, username, highScore }) => {
      if (highScore === null) return [];
      const stored = rowsOf('progress', userId);
      return [
        {
          userId: storedValue(UserId.from(userId), stored),
          username: usernameOf(userId, username),
          result: storedValue(Score.of(highScore), stored),
        },
      ];
    });
  }

  // One group per player. A player has one username, so the group key also
  // holds it. Each stored result is one completed level. The
  // database gives a sum or a count as a bigint or a numeric, so each total
  // becomes a number.
  async standings(gameId: GameId): Promise<LeaderboardEntry<Standing>[]> {
    const rows = await this.db
      .select({
        userId: levelResults.userId,
        username: users.username,
        stars: sql<number>`sum(${levelResults.stars})`.mapWith(Number),
        levelsCompleted: sql<number>`count(*)`.mapWith(Number),
        moves: sql<number>`sum(${levelResults.moves})`.mapWith(Number),
        elapsedMs: sql<number>`sum(${levelResults.elapsedMs})`.mapWith(Number),
      })
      .from(levelResults)
      .innerJoin(users, eq(users.id, levelResults.userId))
      .where(eq(levelResults.gameId, receiveValueOf(gameId)))
      .groupBy(levelResults.userId, users.username);
    return rows.map(({ userId, username, stars, levelsCompleted, moves, elapsedMs }) => {
      const stored = rowsOf('level_results', userId);
      const standing = Standing.of(
        storedValue(Stars.of(stars), stored),
        storedValue(LevelsCompleted.of(levelsCompleted), stored),
        storedValue(Moves.of(moves), stored),
        storedValue(ElapsedTime.ofMs(elapsedMs), stored),
      );
      return {
        userId: storedValue(UserId.from(userId), stored),
        username: usernameOf(userId, username),
        result: storedValue(standing, stored),
      };
    });
  }
}

// The Username of the users row of a player. A stored name that breaks the
// rule of Username names the users table in its message.
function usernameOf(userId: string, username: string): Username {
  return storedValue(Username.create(username), rowsOf('users', userId));
}

// The rows of one user in one table, as storedValue() names them in the
// message of a broken rule.
function rowsOf(table: 'level_results' | 'progress' | 'users', userId: string): string {
  return `The ${table} rows of user ${userId}`;
}
