import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { LeaderboardEntry } from '../../application/ports/leaderboard-entry.js';
import type { LeaderboardReader } from '../../application/ports/leaderboard-reader.js';
import { ElapsedTime } from '../../domain/progress/elapsed-time.js';
import type { GameId } from '../../domain/progress/game-id.js';
import { LevelId } from '../../domain/progress/level-id.js';
import { LevelResult } from '../../domain/progress/level-result.js';
import { LevelsCompleted } from '../../domain/progress/levels-completed.js';
import { Moves } from '../../domain/progress/moves.js';
import { Score } from '../../domain/progress/score.js';
import { Standing } from '../../domain/progress/standing.js';
import { Stars } from '../../domain/progress/stars.js';
import type { Result } from '../../domain/shared/result.js';
import { UserId } from '../../domain/user/user-id.js';
import { receiveValueOf } from '../received.js';
import type { PersistenceDatabase } from './drizzle-user-repository.js';
import { levelResults, progress } from './schema.js';

// Adapter of the LeaderboardReader port over the progress and level_results
// tables of DS-5 (API-FR-03). It reads only the tables of the progress
// module. It filters by gameId and by level, and it sums the totals of a
// standing. It adds no order: the use case orders the entries with the
// comparisons of the domain (classes.md decision 2).
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
    return rows.map(({ userId, levelId: storedLevelId, stars, moves, elapsedMs }) => ({
      userId: UserId.from(userId),
      result: LevelResult.of(
        LevelId.of(storedLevelId),
        Stars.of(stars),
        Moves.of(moves),
        ElapsedTime.ofMs(elapsedMs),
      ),
    }));
  }

  async highScores(gameId: GameId): Promise<LeaderboardEntry<Score>[]> {
    const rows = await this.db
      .select({ userId: progress.userId, highScore: progress.highScore })
      .from(progress)
      .where(and(eq(progress.gameId, receiveValueOf(gameId)), isNotNull(progress.highScore)));
    // The where clause keeps no null. The check only narrows the type.
    return rows.flatMap(({ userId, highScore }) =>
      highScore === null ? [] : [{ userId: UserId.from(userId), result: Score.of(highScore) }],
    );
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
      const count = stored(LevelsCompleted.of(levelsCompleted), userId);
      const standing = Standing.of(
        Stars.of(stars),
        count,
        Moves.of(moves),
        ElapsedTime.ofMs(elapsedMs),
      );
      return { userId: UserId.from(userId), result: stored(standing, userId) };
    });
  }
}

// A stored value that breaks a rule of the domain is a server fault.
function stored<T>(result: Result<T, string>, userId: string): T {
  if (!result.ok) {
    throw new Error(`The level_results rows of user ${userId} break the rule ${result.error}.`);
  }
  return result.value;
}
