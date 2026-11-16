import { GameId } from './game-id.js';
import { LevelResult } from './level-result.js';
import { Score } from './score.js';
import { SyncInstant } from './sync-instant.js';
import { UserId } from '../user/user-id.js';

// The receiver of the parts of a PlayerProgress. PlayerProgress.deliverTo()
// calls it once. Only the border implements it, for example a row mapper or
// a DTO mapper. It gets domain values only: updatedAt is a SyncInstant.
export interface PlayerProgressReceiver {
  receive(
    userId: UserId,
    gameId: GameId,
    highScore: Score | null,
    updatedAt: SyncInstant,
    results: readonly LevelResult[],
  ): void;
}

// Aggregate root: one progress per userId and gameId (API-FR-02, classes.md
// decision 2). It keeps the best level result of each level of its game.
// recordLevel() is the only way to add one. highScore and updatedAt follow
// the proposal of classes.md decision 3. updatedAt is the instant of the last
// sync: each record takes the instant of its sync, and updatedAt never moves
// back. The instant is a parameter: the use case reads it from the Clock
// port. The aggregate has no getter and no snapshot: deliverTo() gives its
// parts to a receiver of the border. A broken rule of a value stops at its
// factory, which returns a failed Result (decision 11). So a wrong argument
// here is a defect of the caller, and its guard throws a TypeError.
export class PlayerProgress {
  // One result per level, in the order of the first record. It holds the
  // best result of each level by the order of DS-4 (DS-12). A game has few
  // levels, so recordLevel() finds the result of a level in this list.
  // lastSync holds the SyncInstant that deliverTo() gives as updatedAt.
  private readonly levelResults: LevelResult[] = [];

  private constructor(
    private readonly userId: UserId,
    private readonly gameId: GameId,
    private best: Score | null,
    private lastSync: SyncInstant,
  ) {}

  static start(userId: UserId, gameId: GameId, at: SyncInstant): PlayerProgress {
    if (!(userId instanceof UserId)) {
      throw new TypeError('A progress needs a userId.');
    }
    if (!(gameId instanceof GameId)) {
      throw new TypeError('A progress needs a gameId.');
    }
    return new PlayerProgress(userId, gameId, null, checkedInstant(at));
  }

  // Rebuilds a stored progress from the parts that deliverTo() gave, in the
  // order of PlayerProgressReceiver. start() checks the key and the instant.
  // restore() records the stored high score and results with the rules of
  // recordScore() and recordLevel(). Each result takes the stored instant,
  // so updatedAt stays the stored instant.
  static restore(
    userId: UserId,
    gameId: GameId,
    highScore: Score | null,
    updatedAt: SyncInstant,
    results: readonly LevelResult[],
  ): PlayerProgress {
    const progress = PlayerProgress.start(userId, gameId, updatedAt);
    if (highScore !== null) {
      progress.best = checkedScore(highScore);
    }
    for (const result of results) {
      progress.recordLevel(result, updatedAt);
    }
    return progress;
  }

  // Two progresses are the same progress when they have the same user and the same game.
  // The other data does not count.
  equals(other: PlayerProgress): boolean {
    return this.userId.equals(other.userId) && this.gameId.equals(other.gameId);
  }

  // Delivers the parts to a receiver of the border in one call. No operation
  // returns them. The list is new, and the values are immutable, so a change
  // to what the receiver gets does not change the aggregate.
  deliverTo(receiver: PlayerProgressReceiver): void {
    receiver.receive(this.userId, this.gameId, this.best, this.lastSync, [...this.levelResults]);
  }

  // Keeps the highest score. The record moves updatedAt to its instant, but
  // never back.
  recordScore(score: Score, at: SyncInstant): void {
    const recorded = checkedScore(score);
    const instant = checkedInstant(at);
    if (this.best === null || recorded.isHigherThan(this.best)) {
      this.best = recorded;
    }
    this.moveTo(instant);
  }

  // Keeps the best result of the level (DS-4, DS-12). A result that is not
  // better than the stored one changes no result, so a tie keeps the stored
  // one. The record moves updatedAt to its instant, but never back.
  recordLevel(result: LevelResult, at: SyncInstant): void {
    if (!(result instanceof LevelResult)) {
      throw new TypeError('recordLevel needs a LevelResult.');
    }
    const instant = checkedInstant(at);
    const index = this.levelResults.findIndex((stored) => stored.isForSameLevelAs(result));
    if (index === -1) {
      this.levelResults.push(result);
    } else if (result.isBetterThan(this.levelResults[index])) {
      this.levelResults[index] = result;
    }
    this.moveTo(instant);
  }

  // updatedAt is the instant of the last sync. An earlier instant does not
  // move it back.
  private moveTo(instant: SyncInstant): void {
    if (instant.isLaterThan(this.lastSync)) {
      this.lastSync = instant;
    }
  }
}

// Score guards the rule of a valid score. The aggregate takes only a Score.
function checkedScore(score: Score): Score {
  if (!(score instanceof Score)) {
    throw new TypeError('A high score must be a Score.');
  }
  return score;
}

// SyncInstant guards the rule of a valid instant. The aggregate takes only a
// SyncInstant.
function checkedInstant(at: SyncInstant): SyncInstant {
  if (!(at instanceof SyncInstant)) {
    throw new TypeError('The instant must be a SyncInstant.');
  }
  return at;
}
