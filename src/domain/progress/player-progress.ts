import { GameId } from './game-id.js';
import { LevelResult } from './level-result.js';
import { Score } from './score.js';
import { UserId } from '../user/user-id.js';

// The receiver of the parts of a PlayerProgress. PlayerProgress.deliverTo()
// calls it once. Only the border implements it, for example a row mapper or
// a DTO mapper. TInstant is the type of updatedAt: deliverTo() binds it to
// Date, and a delivery may pass a primitive (decision 15). The instant gets a
// value object of its own later (#97).
export interface PlayerProgressReceiver<TInstant> {
  receive(
    userId: UserId,
    gameId: GameId,
    highScore: Score | null,
    updatedAt: TInstant,
    results: readonly LevelResult[],
  ): void;
}

// Aggregate root: one progress per userId and gameId (API-FR-02, classes.md
// decision 2). It keeps the best level result of each level of its game.
// recordLevel() is the only way to add one. highScore and updatedAt follow the proposal of
// classes.md decision 3. The instant is a parameter: the use case reads it
// from the Clock port. The aggregate has no getter and no snapshot:
// deliverTo() gives its parts to a receiver of the border. A broken rule of
// a value stops at its factory, which returns a failed Result (decision 11).
// So a wrong argument here is a defect of the caller, and its guard throws a
// TypeError or a RangeError.
export class PlayerProgress {
  // One result per level, in the order of the first record. It holds the
  // best result of each level by the order of DS-4 (DS-12). A game has few
  // levels, so recordLevel() finds the result of a level in this list.
  private readonly levelResults: LevelResult[] = [];

  private constructor(
    private readonly userId: UserId,
    private readonly gameId: GameId,
    private best: Score | null,
    private updatedAtMs: number,
  ) {}

  static start(userId: UserId, gameId: GameId, at: Date): PlayerProgress {
    if (!(userId instanceof UserId)) {
      throw new TypeError('A progress needs a userId.');
    }
    if (!(gameId instanceof GameId)) {
      throw new TypeError('A progress needs a gameId.');
    }
    return new PlayerProgress(userId, gameId, null, epochMsOf(at));
  }

  // Rebuilds a stored progress from the values that it delivered. started is
  // the progress that start() gives for the stored userId, gameId and
  // instant, so start() checks them. restore() keeps the key and the instant
  // of started, and records the stored high score and results. It checks the
  // same rules as recordScore() and recordLevel(). The records of started do
  // not count, and restore() does not change started.
  static restore(
    started: PlayerProgress,
    highScore: Score | null,
    results: readonly LevelResult[],
  ): PlayerProgress {
    if (!(started instanceof PlayerProgress)) {
      throw new TypeError('restore needs a progress that start() made.');
    }
    const progress = new PlayerProgress(started.userId, started.gameId, null, started.updatedAtMs);
    if (highScore !== null) {
      progress.best = checkedScore(highScore);
    }
    for (const result of results) {
      progress.recordLevel(result);
    }
    return progress;
  }

  // Two progresses are the same progress when they have the same user and the same game.
  // The other data does not count.
  equals(other: PlayerProgress): boolean {
    return this.userId.equals(other.userId) && this.gameId.equals(other.gameId);
  }

  // Delivers the parts to a receiver of the border in one call. No operation
  // returns them. The Date and the list are new, and the values are
  // immutable, so a change to what the receiver gets does not change the
  // aggregate.
  deliverTo(receiver: PlayerProgressReceiver<Date>): void {
    receiver.receive(this.userId, this.gameId, this.best, new Date(this.updatedAtMs), [
      ...this.levelResults,
    ]);
  }

  // Keeps the highest score. Every record moves updatedAt to the given instant.
  recordScore(score: Score, at: Date): void {
    const recorded = checkedScore(score);
    const atMs = epochMsOf(at);
    if (this.best === null || recorded.isHigherThan(this.best)) {
      this.best = recorded;
    }
    this.updatedAtMs = atMs;
  }

  // Keeps the best result of the level (DS-4, DS-12). A result that is not
  // better than the stored one changes nothing, so a tie keeps the stored one.
  recordLevel(result: LevelResult): void {
    if (!(result instanceof LevelResult)) {
      throw new TypeError('recordLevel needs a LevelResult.');
    }
    const index = this.levelResults.findIndex((stored) => stored.isForSameLevelAs(result));
    if (index === -1) {
      this.levelResults.push(result);
    } else if (result.isBetterThan(this.levelResults[index])) {
      this.levelResults[index] = result;
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

function epochMsOf(at: Date): number {
  const epochMs = at instanceof Date ? at.getTime() : Number.NaN;
  if (Number.isNaN(epochMs)) {
    throw new RangeError('The instant must be a valid Date.');
  }
  return epochMs;
}
