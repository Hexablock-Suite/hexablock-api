import type { ProgressRepository } from '../../src/application/ports/progress-repository.js';
import type { GameId } from '../../src/domain/progress/game-id.js';
import type { PlayerProgress } from '../../src/domain/progress/player-progress.js';
import type { UserId } from '../../src/domain/progress/user-id.js';

// Test double for the ProgressRepository port. It keeps one progress per
// userId and gameId: a second save for the same key replaces the first.
export class InMemoryProgressRepository implements ProgressRepository {
  private readonly progressByKey = new Map<string, PlayerProgress>();

  find(userId: UserId, gameId: GameId): Promise<PlayerProgress | null> {
    return Promise.resolve(this.progressByKey.get(keyOf(userId, gameId)) ?? null);
  }

  save(progress: PlayerProgress): Promise<void> {
    this.progressByKey.set(keyOf(progress.userId, progress.gameId), progress);
    return Promise.resolve();
  }
}

// JSON keeps the two values apart, whatever characters they hold.
function keyOf(userId: UserId, gameId: GameId): string {
  return JSON.stringify([userId.value, gameId.value]);
}
