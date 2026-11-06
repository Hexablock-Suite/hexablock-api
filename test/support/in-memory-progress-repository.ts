import type { ProgressRepository } from '../../src/application/ports/progress-repository.js';
import type { GameId } from '../../src/domain/progress/game-id.js';
import { PlayerProgress } from '../../src/domain/progress/player-progress.js';
import type { UserId } from '../../src/domain/user/user-id.js';

// Test double for the ProgressRepository port. It keeps one progress per
// userId and gameId: a second save for the same key replaces the first.
// It keeps a copy and returns a copy, as the Drizzle adapter keeps rows.
export class InMemoryProgressRepository implements ProgressRepository {
  private readonly progressByKey = new Map<string, PlayerProgress>();

  find(userId: UserId, gameId: GameId): Promise<PlayerProgress | null> {
    const stored = this.progressByKey.get(keyOf(userId, gameId));
    return Promise.resolve(stored === undefined ? null : copyOf(stored));
  }

  save(progress: PlayerProgress): Promise<void> {
    this.progressByKey.set(keyOf(progress.userId, progress.gameId), copyOf(progress));
    return Promise.resolve();
  }
}

// JSON keeps the two values apart, whatever characters they hold.
function keyOf(userId: UserId, gameId: GameId): string {
  return JSON.stringify([userId.value, gameId.value]);
}

// A new aggregate with the same state. LevelResult is immutable, so the
// copy shares the results.
function copyOf(progress: PlayerProgress): PlayerProgress {
  return PlayerProgress.restore({
    userId: progress.userId,
    gameId: progress.gameId,
    highScore: progress.highScore,
    updatedAt: progress.updatedAt,
    results: progress.results,
  });
}
