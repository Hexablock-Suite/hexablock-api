import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { LeaderboardEntry } from '../../application/ports/leaderboard-entry.js';
import type { LeaderboardReader } from '../../application/ports/leaderboard-reader.js';
import { ElapsedTime } from '../../domain/progress/elapsed-time.js';
import type { GameId } from '../../domain/progress/game-id.js';
import type { LevelId } from '../../domain/progress/level-id.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import { LevelsCompleted } from '../../domain/progress/levels-completed.js';
import { Moves } from '../../domain/progress/moves.js';
import { Score } from '../../domain/progress/score.js';
import { Standing } from '../../domain/progress/standing.js';
import { Stars } from '../../domain/progress/stars.js';
import { UserId } from '../../domain/user/user-id.js';
import { buildLevelResult } from '../built.js';
import { receiveValueOf } from '../received.js';
import type { PersistenceDatabase } from './drizzle-user-repository.js';
import { levelResults, progress } from './schema.js';
import { storedValue } from './stored-value.js';

// Adapter of the LeaderboardReader port over the progress and level_results
// tables of DS-5 (API-FR-03). It reads only the tables of the progress
// module. It filters by gameId and by level, and it sums the totals of a
// standing. It adds no order: the use case orders the entries with the
// comparisons of the domain (classes.md decision 2). A stored value that
// breaks a rule of the domain is a server fault, so the reader throws.
export class DrizzleLeaderboardReader implements LeaderboardReader {
  constructor(private readonly db: PersistenceDatabase) {}

  async levelResults(gameId: GameId, levelId: LevelId): Promise<LeaderboardEntry<LevelResult>[]> {
    const rows = await this.db
      .select()
      .from(levelResults)
      .where(
        and(
          eq(levelResults.gameId, receiveValueOf(gameId)),
          eq(levelResults.levelId, receiveValueOf(levelId)),
        ),
      );
    // The reader builds the four value objects of each stored result.
    return rows.map((row) => {
      const stored = `The level_results rows of user ${row.userId}`;
      return {
        userId: storedValue(UserId.from(row.userId), stored),
        result: storedValue(buildLevelResult(row), stored),
      };
    });
  }

  async highScores(gameId: GameId): Promise<LeaderboardEntry<Score>[]> {
    const rows = await this.db
      .select({ userId: progress.userId, highScore: progress.highScore })
      .from(progress)
      .where(and(eq(progress.gameId, receiveValueOf(gameId)), isNotNull(progress.highScore)));
    // The where clause keeps no null. The check only narrows the type.
    return rows.flatMap(({ userId, highScore }) => {
      if (highScore === null) return [];
      const stored = `The progress rows of user ${userId}`;
      return [
        {
          userId: storedValue(UserId.from(userId), stored),
          result: storedValue(Score.of(highScore), stored),
        },
      ];
    });
  }

  // One group per player. Each stored result is one completed level. The
  // database gives a sum or a count as a bigint or a numeric, so each total
  // becomes a number.
  async standings(gameId: GameId): Promise<LeaderboardEntry<Standing>[]> {
    const rows = await this.db
      .select({
        userId: levelResults.userId,
        stars: sql<number>`sum(${levelResults.stars})`.mapWith(Number),
        levelsCompleted: sql<number>`count(*)`.mapWith(Number),
        moves: sql<number>`sum(${levelResults.moves})`.mapWith(Number),
        elapsedMs: sql<number>`sum(${levelResults.elapsedMs})`.mapWith(Number),
      })
      .from(levelResults)
      .where(eq(levelResults.gameId, receiveValueOf(gameId)))
      .groupBy(levelResults.userId);
    return rows.map(({ userId, stars, levelsCompleted, moves, elapsedMs }) => {
      const stored = `The level_results rows of user ${userId}`;
      const standing = Standing.of(
        storedValue(Stars.of(stars), stored),
        storedValue(LevelsCompleted.of(levelsCompleted), stored),
        storedValue(Moves.of(moves), stored),
        storedValue(ElapsedTime.ofMs(elapsedMs), stored),
      );
      return {
        userId: storedValue(UserId.from(userId), stored),
        result: storedValue(standing, stored),
      };
    });
  }
}
