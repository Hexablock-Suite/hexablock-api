import { GameId } from './game-id.js';
import { UserId } from '../user/user-id.js';

// The receiver of the two parts of a ProgressKey. ProgressKey.deliverTo()
// calls it once. Only the border implements it, for example the repository
// that finds and changes one progress by its key.
export interface ProgressKeyReceiver {
  receive(userId: UserId, gameId: GameId): void;
}

// Value object for the identity of a PlayerProgress: one progress per userId
// and gameId (API-FR-02, DS-5, classes.md decision 2). The name is
// provisional until the team reviews it (#107). UserId and GameId guard their
// own rules, and any user can have a progress in any game. So no pair of
// valid parts breaks a rule. So of() returns the key itself: a factory that
// no datum can fail returns the value (rule «One failure mechanism», #148).
// An argument of another type is a defect of the caller, so its guard throws
// a TypeError.
export class ProgressKey {
  private constructor(
    private readonly userId: UserId,
    private readonly gameId: GameId,
  ) {}

  static of(userId: UserId, gameId: GameId): ProgressKey {
    if (!(userId instanceof UserId)) {
      throw new TypeError('A progress needs a userId.');
    }
    if (!(gameId instanceof GameId)) {
      throw new TypeError('A progress needs a gameId.');
    }
    return new ProgressKey(userId, gameId);
  }

  // Delivers the two parts to a receiver of the border in one call. No
  // operation returns them.
  deliverTo(receiver: ProgressKeyReceiver): void {
    receiver.receive(this.userId, this.gameId);
  }

  // Two keys are equal when they have the same user and the same game.
  equals(other: ProgressKey): boolean {
    return this.userId.equals(other.userId) && this.gameId.equals(other.gameId);
  }
}
