import { receiveValueOf } from '../../src/adapters/received.js';
import type { LeaderboardEntry } from '../../src/application/ports/leaderboard-entry.js';
import type { GameId } from '../../src/domain/shared/game-id.js';
import type { LevelResult } from '../../src/domain/progress/level-result.js';
import { PlayerProgress } from '../../src/domain/progress/player-progress.js';
import { ProgressKey } from '../../src/domain/progress/progress-key.js';
import { Score } from '../../src/domain/progress/score.js';
import type { SyncInstant } from '../../src/domain/progress/sync-instant.js';
import { UserId } from '../../src/domain/shared/user-id.js';
import { valueOf } from './result.js';

// The progress of one player in one game: an optional high score and level
// results. The contracts of the board readers store their rows as these.
// The username names the account of the player (#230). A harness stores one
// account per player, with the first username that a progress of that
// player gives, or a name of its own when none gives one.
export interface PlayedProgress {
  readonly userId: string;
  readonly username?: string;
  readonly gameId: GameId;
  readonly score?: number;
  readonly results?: readonly LevelResult[];
}

// Builds the PlayerProgress aggregate of one played progress. The aggregate
// records each value at the given instant.
export function progressOf(played: PlayedProgress, at: SyncInstant): PlayerProgress {
  const { userId, gameId, score, results = [] } = played;
  const progress = PlayerProgress.start(ProgressKey.of(valueOf(UserId.from(userId)), gameId), at);
  if (score !== undefined) {
    progress.recordScore(valueOf(Score.of(score)), at);
  }
  for (const result of results) {
    progress.recordLevel(result, at);
  }
  return progress;
}

// The userId and the username of each entry, as text, sorted by player
// (#230).
export function namesOf<T>(
  entries: readonly LeaderboardEntry<T>[],
): { userId: string; username: string }[] {
  return entries
    .map(({ userId, username }) => ({
      userId: receiveValueOf(userId),
      username: receiveValueOf(username),
    }))
    .sort((left, right) => left.userId.localeCompare(right.userId));
}

// A board reader gives the entries in no order. A test sorts them by player.
export function byPlayer<T>(
  entries: readonly LeaderboardEntry<T>[],
): { userId: string; result: T }[] {
  return entries
    .map(({ userId, result }) => ({ userId: receiveValueOf(userId), result }))
    .sort((left, right) => left.userId.localeCompare(right.userId));
}
