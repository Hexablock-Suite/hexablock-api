import { GameId } from './game-id.js';
import { LevelResult } from './level-result.js';
import { ProgressError } from './progress-error.js';
import { UserId } from '../user/user-id.js';

// The stored state of one progress. A repository reads it back with
// PlayerProgress.restore().
export interface PlayerProgressState {
  userId: UserId;
  gameId: GameId;
  highScore: number | null;
  updatedAt: Date;
  results: readonly LevelResult[];
}

// Aggregate root: one progress per userId and gameId (API-FR-02, classes.md
// decision 2). It keeps the best level result of each level of its game.
// recordLevel() is the only way to add one. highScore and updatedAt follow the proposal of
// classes.md decision 3. The instant is a parameter: the use case reads it
// from the Clock port.
export class PlayerProgress {
  // One result per levelId, in the order of the first record. It holds the
  // best result of each level by the order of DS-4 (DS-12).
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

  // Rebuilds a stored progress. It checks the same rules as start(),
  // recordScore() and recordLevel().
  static restore(state: PlayerProgressState): PlayerProgress {
    const progress = PlayerProgress.start(state.userId, state.gameId, state.updatedAt);
    if (state.highScore !== null) {
      checkScore(state.highScore);
      progress.best = state.highScore;
    }
    for (const result of state.results) {
      progress.recordLevel(result);
    }
    return progress;
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
    checkScore(score);
    const atMs = epochMsOf(at);
    this.best = this.best === null ? score : Math.max(this.best, score);
    this.updatedAtMs = atMs;
  }

  // Keeps the best result of the level (DS-4, DS-12). A result that is not
  // better than the stored one changes nothing, so a tie keeps the stored one.
  recordLevel(result: LevelResult): void {
    if (!(result instanceof LevelResult)) {
      throw new ProgressError('recordLevel needs a LevelResult.');
    }
    const stored = this.resultsByLevel.get(result.levelId);
    if (stored === undefined || result.isBetterThan(stored)) {
      this.resultsByLevel.set(result.levelId, result);
    }
  }
}

function checkScore(score: number): void {
  if (!Number.isSafeInteger(score) || score < 0) {
    throw new ProgressError(`score must be a non-negative integer, got ${score}.`);
  }
}

function epochMsOf(at: Date): number {
  const epochMs = at instanceof Date ? at.getTime() : Number.NaN;
  if (Number.isNaN(epochMs)) {
    throw new ProgressError('The instant must be a valid Date.');
  }
  return epochMs;
}
