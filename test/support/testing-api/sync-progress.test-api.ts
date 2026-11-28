import type { LevelResultValues } from '../../../src/adapters/received.js';
import type { Clock } from '../../../src/application/ports/clock.js';
import type { LevelFinder } from '../../../src/application/ports/level-repository.js';
import type { ProgressRepository } from '../../../src/application/ports/progress-repository.js';
import type { ProgressProblem } from '../../../src/application/progress/progress-problem.js';
import {
  type SyncProgress,
  type SyncProgressRequest,
  SyncProgressUseCase,
} from '../../../src/application/progress/sync-progress.use-case.js';
import type { PlayerProgress } from '../../../src/domain/progress/player-progress.js';
import { Score } from '../../../src/domain/progress/score.js';
import { Stars } from '../../../src/domain/progress/stars.js';
import type { SyncInstant } from '../../../src/domain/progress/sync-instant.js';
import type { Result } from '../../../src/domain/shared/result.js';
import type { MockInstance } from 'vitest';
import { FixedClock } from '../fixed-clock.js';
import { type HeldGame, heldLevels } from '../held-levels.js';
import { InMemoryLevelRepository } from '../in-memory-level-repository.js';
import { InMemoryProgressRepository } from '../in-memory-progress-repository.js';
import { levelValidators } from '../level-format.js';
import { ProgressMother } from '../object-mother/progress-mother.js';
import { UserMother } from '../object-mother/user-mother.js';
import { progressPartsOf } from '../recording-receiver.js';
import { valueOf } from '../result.js';
import { Arrangements } from './arrangements.js';
import { WhenOutcome } from './when-outcome.js';

// One sync as a test names it: the gameId, the score and the level results,
// as plain values. A sync with no gameId syncs hexa-lines, and a sync with no
// score key sends a score of 120. A score key with undefined sends no score.
export interface SyncValues {
  readonly gameId?: string;
  readonly score?: number;
  readonly results?: readonly LevelResultValues[];
}

// A stored progress as a then step names it. A then step checks only the
// parts that it names.
export interface StoredProgress {
  readonly highScore?: number | null;
  readonly updatedAt?: SyncInstant;
  readonly results?: readonly LevelResultValues[];
}

// A failure of a sync as a test names it, with plain values.
export type SyncFailure =
  | { readonly kind: 'unknown-user' }
  | { readonly kind: 'unknown-level'; readonly result: LevelResultValues }
  | { readonly kind: 'too-many-stars'; readonly result: LevelResultValues; readonly most: number };

type SyncAnswer = Result<PlayerProgress, ProgressProblem>;

// Testing API of SyncProgressUseCase (API-FR-02, DS-6). It builds the use case
// and its test doubles, and the doubles stay private: a test names no
// double. The progress store, the clock and the LevelFinder role of the
// level store (#193) are the ports of the use case. Every sync is of user 1.
// The given steps run their syncs before the next when step, in order. A
// then step reads the answers of the last when step and the progress that
// the store held after it. A then step fails when no when step ran.
export class SyncProgressTestApi {
  private progress = new InMemoryProgressRepository();
  private readonly fixedClock = new FixedClock(ProgressMother.START);
  private clock: Clock = this.fixedClock;
  // The levels that the tests sync: each one has 3 star thresholds (DS-6).
  private levels: LevelFinder = heldLevels([['hexa-fit', ['fit-01', 'fit-02']]]);
  private findFor: MockInstance<LevelFinder['findFor']> | undefined;
  private readonly arrangements = new Arrangements();
  private readonly outcome = new WhenOutcome<readonly SyncAnswer[]>();
  private readonly gameIds = new Set<string>();
  private stored = new Map<string, PlayerProgress | null>();

  givenASync(values: SyncValues = {}): this {
    this.arrangements.add(() => this.useCase().execute(this.requestOf(values)));
    return this;
  }

  givenFiveMinutesPass(): this {
    this.arrangements.add(() => this.fixedClock.advanceBy(ProgressMother.FIVE_MINUTES_MS));
    return this;
  }

  // #97: the types forbid a Clock that gives another value than a SyncInstant.
  givenTheClockGivesNoSyncInstant(): this {
    this.arrangements.add(() => {
      this.clock = { now: () => new Date(Number.NaN) as unknown as SyncInstant };
    });
    return this;
  }

  // The repository fails with unknown-user when no user has the id of the
  // key (#137).
  givenTheProgressStoreKnowsNoUser(): this {
    this.progress = new InMemoryProgressRepository([]);
    return this;
  }

  // The level store holds a level of each named gameId and levelId, with 3
  // star thresholds.
  givenTheLevelStoreHolds(games: readonly HeldGame[]): this {
    this.levels = heldLevels(games);
    return this;
  }

  // A stored row that breaks a rule has no star thresholds (#147).
  givenTheStoredRowOfTheLevelIsBroken(gameId: string, levelId: string): this {
    const levels = new InMemoryLevelRepository(levelValidators());
    levels.storeRow({
      gameId,
      levelId,
      order: 1,
      version: 1,
      topology: 'hex',
      section: { broken: true },
    });
    this.levels = levels;
    return this;
  }

  async whenSyncing(values: SyncValues = {}): Promise<this> {
    return this.when(() => this.useCase().execute(this.requestOf(values)), values);
  }

  // The request types forbid this value. The mapper of the border builds
  // every value, so a value that is not a Score is a defect of the caller.
  async whenSyncingAScoreThatIsNotAScore(score: number): Promise<this> {
    return this.when(
      () =>
        this.useCase().execute({
          ...this.requestOf({}),
          score: score as unknown as Score,
        }),
      {},
    );
  }

  // Two syncs overlap: both start before either one ends.
  async whenTwoSyncsOverlap(first: SyncValues, second: SyncValues): Promise<this> {
    await this.arrangements.run();
    this.watchTheLevels();
    this.remember(first, second);
    await this.outcome.record(() =>
      Promise.all([first, second].map((values) => this.useCase().execute(this.requestOf(values)))),
    );
    await this.readTheStore();
    return this;
  }

  // The stale sync starts first, but reaches the progress store only after
  // the fresh sync saved. The clock moves five minutes between the two.
  async whenAStaleSyncSavesLast(stale: SyncValues, fresh: SyncValues): Promise<this> {
    await this.arrangements.run();
    this.watchTheLevels();
    this.remember(stale, fresh);
    await this.outcome.record(async () => {
      let openGate = (): void => {};
      const gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });
      const held = new SyncProgressUseCase(
        intercepted(this.progress, () => gate),
        this.levels,
        this.clock,
      );
      const staleSync = held.execute(this.requestOf(stale));
      this.fixedClock.advanceBy(ProgressMother.FIVE_MINUTES_MS);
      await this.useCase().execute(this.requestOf(fresh));
      openGate();
      return [await staleSync];
    });
    await this.readTheStore();
    return this;
  }

  thenTheSyncSucceeds(): void {
    expect(this.answer().ok).toBe(true);
  }

  thenBothSyncsSucceed(): void {
    expect(this.outcome.value().map((answer) => answer.ok)).toEqual([true, true]);
  }

  // The answer of the last sync is the progress that the store holds.
  thenTheSyncGivesTheStoredProgressOf(gameId: string): void {
    const answer = this.answer();
    expect(answer.ok && answer.value).toEqual(this.storedProgressOf(gameId));
  }

  // The answer of the last sync holds these level results, in this order.
  thenTheLastSyncGivesTheResults(results: readonly LevelResultValues[]): void {
    const answer = this.answer();
    const last = answer.ok ? answer.value : null;
    expect(progressPartsOf(last)?.results).toEqual(
      results.map((values) => ProgressMother.levelResult(values)),
    );
  }

  thenTheSyncFailsWith(failure: SyncFailure): void {
    expect(this.answer()).toEqual({ ok: false, error: problemOf(failure) });
  }

  thenTheSyncFailsWithTheKind(kind: ProgressProblem['kind']): void {
    const answer = this.answer();
    expect(answer.ok || answer.error.kind).toBe(kind);
  }

  // The guard of the aggregate throws, so the client gets a 500 (decision 11).
  thenTheSyncRejectsWith(error: Error): void {
    const rejection = this.outcome.rejection();
    expect(() => {
      throw rejection;
    }).toThrow(error);
  }

  thenTheStoredProgressIs(gameId: string, expected: StoredProgress): void {
    this.outcome.ran();
    const stored = this.storedProgressOf(gameId);
    expect(stored).not.toBeNull();
    const parts = progressPartsOf(stored);
    if (expected.highScore === null) {
      expect(parts?.highScore).toBeNull();
    } else if (expected.highScore !== undefined) {
      expect(parts?.highScore?.equals(valueOf(Score.of(expected.highScore)))).toBe(true);
    }
    if (expected.updatedAt !== undefined) {
      expect(parts?.updatedAt).toEqual(expected.updatedAt);
    }
    if (expected.results !== undefined) {
      expect(parts?.results).toEqual(
        expected.results.map((values) => ProgressMother.levelResult(values)),
      );
    }
  }

  // Every part of the stored progress, the key of user 1 included.
  thenTheStoredProgressIsExactly(
    gameId: string,
    expected: { readonly updatedAt: SyncInstant; readonly results: readonly LevelResultValues[] },
  ): void {
    this.outcome.ran();
    expect(progressPartsOf(this.storedProgressOf(gameId))).toEqual({
      key: ProgressMother.key(1, gameId),
      highScore: null,
      updatedAt: expected.updatedAt,
      results: expected.results.map((values) => ProgressMother.levelResult(values)),
    });
  }

  thenNoProgressIsStoredFor(gameId: string): void {
    this.outcome.ran();
    expect(this.storedProgressOf(gameId)).toBeNull();
  }

  // A sync with no result reads no level (#171).
  thenNoLevelWasRead(): void {
    this.outcome.ran();
    expect(this.findFor).not.toHaveBeenCalled();
  }

  // One read per sync (#217): findFor() once, with the gameId and every
  // result in the order of the request.
  thenTheLevelsWereReadOnceFor(gameId: string, results: readonly LevelResultValues[]): void {
    this.outcome.ran();
    expect(this.findFor).toHaveBeenCalledTimes(1);
    expect(this.findFor).toHaveBeenCalledWith(
      ProgressMother.gameId(gameId),
      results.map((values) => ProgressMother.levelResult(values)),
    );
  }

  private async when(sync: () => Promise<SyncAnswer>, values: SyncValues): Promise<this> {
    await this.arrangements.run();
    this.watchTheLevels();
    this.remember(values);
    await this.outcome.record(async () => [await sync()]);
    await this.readTheStore();
    return this;
  }

  // The use case holds no state, so each sync gets a new one with the
  // doubles of the scenario.
  private useCase(): SyncProgress {
    return new SyncProgressUseCase(this.progress, this.levels, this.clock);
  }

  // Builds the request as the mapper of the border does: the use case gets
  // domain values.
  private requestOf(values: SyncValues): SyncProgressRequest {
    const { gameId = 'hexa-lines', results = [] } = values;
    const score = 'score' in values ? values.score : 120;
    this.gameIds.add(gameId);
    return {
      userId: UserMother.id(1),
      gameId: ProgressMother.gameId(gameId),
      score: score === undefined ? undefined : valueOf(Score.of(score)),
      results: results.map((values) => ProgressMother.levelResult(values)),
    };
  }

  private remember(...syncs: readonly SyncValues[]): void {
    for (const { gameId = 'hexa-lines' } of syncs) {
      this.gameIds.add(gameId);
    }
  }

  private watchTheLevels(): void {
    this.findFor ??= vi.spyOn(this.levels, 'findFor');
  }

  // Keeps the progress that the store holds for each game of the scenario.
  private async readTheStore(): Promise<void> {
    const entries = await Promise.all(
      [...this.gameIds].map(
        async (gameId) =>
          [gameId, await this.progress.find(ProgressMother.key(1, gameId))] as const,
      ),
    );
    this.stored = new Map(entries);
  }

  private storedProgressOf(gameId: string): PlayerProgress | null {
    const stored = this.stored.get(gameId);
    if (stored === undefined) {
      throw new Error(`No sync of the scenario names the game ${gameId}.`);
    }
    return stored;
  }

  private answer(): SyncAnswer {
    const answers = this.outcome.value();
    const last = answers.at(-1);
    if (last === undefined) {
      throw new Error('The when step gave no answer.');
    }
    return last;
  }
}

function problemOf(failure: SyncFailure): ProgressProblem {
  switch (failure.kind) {
    case 'unknown-user':
      return failure;
    case 'unknown-level':
      return { kind: 'unknown-level', result: ProgressMother.levelResult(failure.result) };
    case 'too-many-stars':
      return {
        kind: 'too-many-stars',
        result: ProgressMother.levelResult(failure.result),
        most: valueOf(Stars.of(failure.most)),
      };
  }
}

// Wraps a repository. Each call of a method first awaits `before`, which
// gets the method name. The stale sync uses it to hold its calls.
function intercepted(
  repository: ProgressRepository,
  before: (method: string) => Promise<void>,
): ProgressRepository {
  return new Proxy(repository, {
    get(target, property, receiver) {
      const member: unknown = Reflect.get(target, property, receiver);
      if (typeof member !== 'function') {
        return member;
      }
      return async (...args: unknown[]) => {
        await before(String(property));
        return Reflect.apply(member, target, args) as unknown;
      };
    },
  });
}
