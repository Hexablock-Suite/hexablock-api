import { GameId } from './game-id.js';
import { LevelResult } from './level-result.js';
import { ProgressError } from './progress-error.js';
import { UserId } from './user-id.js';

// Aggregate root: one progress per userId and gameId (API-FR-02, classes.md
// decision 2). It keeps the level results of its game. recordLevel() is the
// only way to add one. highScore and updatedAt follow the proposal of
// classes.md decision 3. The instant is a parameter: the use case reads it
// from the Clock port.
export class PlayerProgress {
  // One result per levelId, in the order of the first record. Assumption
  // until DS-4 (#24): the last recorded result replaces the earlier one.
  private readonly resultsByLevel = new Map<string, LevelResult>();

  private constructor(
    readonly userId: UserId,
    readonly gameId: GameId,
    private best: number | null,
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

  get highScore(): number | null {
    return this.best;
  }

  get updatedAt(): Date {
    return new Date(this.updatedAtMs);
  }

  get results(): LevelResult[] {
    return [...this.resultsByLevel.values()];
  }

  // Keeps the highest score. Every record moves updatedAt to the given instant.
  recordScore(score: number, at: Date): void {
    if (!Number.isSafeInteger(score) || score < 0) {
      throw new ProgressError(`score must be a non-negative integer, got ${score}.`);
    }
    const atMs = epochMsOf(at);
    this.best = this.best === null ? score : Math.max(this.best, score);
    this.updatedAtMs = atMs;
  }

  recordLevel(result: LevelResult): void {
    if (!(result instanceof LevelResult)) {
      throw new ProgressError('recordLevel needs a LevelResult.');
    }
    this.resultsByLevel.set(result.levelId, result);
  }
}

function epochMsOf(at: Date): number {
  const epochMs = at instanceof Date ? at.getTime() : Number.NaN;
  if (Number.isNaN(epochMs)) {
    throw new ProgressError('The instant must be a valid Date.');
  }
  return epochMs;
}
