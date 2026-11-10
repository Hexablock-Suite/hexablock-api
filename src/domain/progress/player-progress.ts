import { GameId } from './game-id.js';
import { LevelResult } from './level-result.js';
import { ProgressError } from './progress-error.js';
import { Score } from './score.js';
import { UserId } from '../user/user-id.js';

// The state of one progress, as domain values. PlayerProgress.snapshot()
// gives it, and PlayerProgress.restore() builds the aggregate again from it.
// It is the Memento of the aggregate (Millett and Tune): a mapper reads it
// and maps it to rows or to a DTO. It has no rule and no behavior.
export interface PlayerProgressState {
  readonly userId: UserId;
  readonly gameId: GameId;
  readonly highScore: Score | null;
  readonly updatedAt: Date;
  readonly results: readonly LevelResult[];
}

// Aggregate root: one progress per userId and gameId (API-FR-02, classes.md
// decision 2). It keeps the best level result of each level of its game.
// recordLevel() is the only way to add one. highScore and updatedAt follow the proposal of
// classes.md decision 3. The instant is a parameter: the use case reads it
// from the Clock port. The aggregate has no getter: snapshot() gives a copy
// of its state.
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
      throw new ProgressError('A progress needs a userId.');
    }
    if (!(gameId instanceof GameId)) {
      throw new ProgressError('A progress needs a gameId.');
    }
    return new PlayerProgress(userId, gameId, null, epochMsOf(at));
  }

  // Rebuilds a stored progress. It checks the same rules as start(),
  // recordScore() and recordLevel().
  static restore(state: PlayerProgressState): PlayerProgress {
    const progress = PlayerProgress.start(state.userId, state.gameId, state.updatedAt);
    if (state.highScore !== null) {
      progress.best = checkedScore(state.highScore);
    }
    for (const result of state.results) {
      progress.recordLevel(result);
    }
    return progress;
  }

  // Two progresses are the same progress when they have the same user and the same game.
  // The other data does not count.
  equals(other: PlayerProgress): boolean {
    return this.userId.equals(other.userId) && this.gameId.equals(other.gameId);
  }

  // Gives a copy of the state. A change to the copy does not change the
  // aggregate: the Date and the list are new, and the values are immutable.
  snapshot(): PlayerProgressState {
    return {
      userId: this.userId,
      gameId: this.gameId,
      highScore: this.best,
      updatedAt: new Date(this.updatedAtMs),
      results: [...this.levelResults],
    };
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
      throw new ProgressError('recordLevel needs a LevelResult.');
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
    throw new ProgressError('A high score must be a Score.');
  }
  return score;
}

function epochMsOf(at: Date): number {
  const epochMs = at instanceof Date ? at.getTime() : Number.NaN;
  if (Number.isNaN(epochMs)) {
    throw new ProgressError('The instant must be a valid Date.');
  }
  return epochMs;
}
