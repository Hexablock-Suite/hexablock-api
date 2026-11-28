import type { GameId } from '../../../src/domain/shared/game-id.js';
import type { UserId } from '../../../src/domain/shared/user-id.js';

// Wrong example: two public read-only fields. A public read-only field counts
// as a getter (design decision of 2026-11-12).
export class Membership {
  readonly gameId: GameId;

  private constructor(
    readonly userId: UserId,
    gameId: GameId,
  ) {
    this.gameId = gameId;
  }
}
