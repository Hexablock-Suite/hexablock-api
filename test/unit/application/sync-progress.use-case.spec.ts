import type { LevelResultValues } from '../../../src/adapters/received.js';
import type { ProgressRepository } from '../../../src/application/ports/progress-repository.js';
import {
  type SyncProgressRequest,
  SyncProgressUseCase,
} from '../../../src/application/progress/sync-progress.use-case.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { Score } from '../../../src/domain/progress/score.js';
import type { SyncInstant } from '../../../src/domain/progress/sync-instant.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { InMemoryProgressRepository } from '../../support/in-memory-progress-repository.js';
import { levelResultOf } from '../../support/level-results.js';
import { progressPartsOf } from '../../support/recording-receiver.js';
import { syncInstantOf } from '../../support/sync-instants.js';
import { testUserId } from '../../support/user-ids.js';
import { valueOf } from '../../support/result.js';

const ADA = valueOf(UserId.from(testUserId(1)));
const AT_TIME = new Date('2026-11-06T10:00:00.000Z');
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const AT = syncInstantOf(AT_TIME);
const LATER = syncInstantOf(new Date(AT_TIME.getTime() + FIVE_MINUTES_MS));

// Builds the request as the mapper of the border does: the use case gets
// domain values. A call with no score key sends a score of 120.
function syncRequest(
  values: { gameId?: string; score?: number; results?: LevelResultValues[] } = {},
): SyncProgressRequest {
  const { gameId = 'hexa-lines', results = [] } = values;
  const score = 'score' in values ? values.score : 120;
  return {
    userId: ADA,
    gameId: valueOf(GameId.of(gameId)),
    score: score === undefined ? undefined : valueOf(Score.of(score)),
    results: results.map((result) => levelResultOf(result)),
  };
}

// Wraps a repository. Each call of a method first awaits `before`, which
// gets the method name. A test uses it to record the calls or to hold them.
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

describe('SyncProgressUseCase (API-FR-02)', () => {
  let progress: InMemoryProgressRepository;
  let clock: FixedClock;
  let sync: SyncProgressUseCase;

  beforeEach(() => {
    progress = new InMemoryProgressRepository();
    clock = new FixedClock(AT);
    sync = new SyncProgressUseCase(progress, clock);
  });

  it('should_save_new_progress_with_score_at_clock_instant_when_user_has_no_progress_for_game', async () => {
    const result = await sync.execute(syncRequest());

    expect(result.ok).toBe(true);
    const stored = await progress.find(ADA, valueOf(GameId.of('hexa-lines')));
    expect(stored).not.toBeNull();
    expect(progressPartsOf(stored)?.highScore?.equals(valueOf(Score.of(120)))).toBe(true);
    expect(progressPartsOf(stored)?.updatedAt).toEqual(AT);
    expect(progressPartsOf(stored)?.results).toEqual([]);
    expect(result.ok && result.value).toEqual(stored);
  });

  it('should_keep_one_progress_with_highest_score_when_same_game_syncs_twice', async () => {
    await sync.execute(syncRequest({ score: 120 }));
    clock.advanceBy(FIVE_MINUTES_MS);

    const result = await sync.execute(syncRequest({ score: 80 }));

    const stored = await progress.find(ADA, valueOf(GameId.of('hexa-lines')));
    expect(result.ok && result.value).toEqual(stored);
    expect(progressPartsOf(stored)?.highScore?.equals(valueOf(Score.of(120)))).toBe(true);
    expect(progressPartsOf(stored)?.updatedAt).toEqual(LATER);
  });

  it('should_keep_separate_progress_when_user_syncs_two_games', async () => {
    await sync.execute(syncRequest({ gameId: 'hexa-lines', score: 120 }));
    await sync.execute(syncRequest({ gameId: 'hexa-merge', score: 300 }));

    expect(
      progressPartsOf(
        await progress.find(ADA, valueOf(GameId.of('hexa-lines'))),
      )?.highScore?.equals(valueOf(Score.of(120))),
    ).toBe(true);
    expect(
      progressPartsOf(
        await progress.find(ADA, valueOf(GameId.of('hexa-merge'))),
      )?.highScore?.equals(valueOf(Score.of(300))),
    ).toBe(true);
  });

  it('should_record_level_results_without_score_when_request_has_only_results', async () => {
    const level = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 };

    const result = await sync.execute(
      syncRequest({ gameId: 'hexa-fit', score: undefined, results: [level] }),
    );

    expect(result.ok).toBe(true);
    const stored = await progress.find(ADA, valueOf(GameId.of('hexa-fit')));
    expect(progressPartsOf(stored)?.highScore).toBeNull();
    expect(progressPartsOf(stored)?.updatedAt).toEqual(AT);
    expect(progressPartsOf(stored)?.results).toEqual([levelResultOf(level)]);
  });

  // A better result for a stored levelId takes its place (DS-4, DS-12).
  it('should_store_better_level_result_and_keep_other_levels_when_stored_progress_syncs_again', async () => {
    const first = { levelId: 'fit-01', stars: 1, moves: 20, elapsedMs: 60000 };
    const retry = { levelId: 'fit-01', stars: 3, moves: 9, elapsedMs: 30000 };
    const next = { levelId: 'fit-02', stars: 2, moves: 12, elapsedMs: 45000 };
    await sync.execute(syncRequest({ gameId: 'hexa-fit', score: undefined, results: [first] }));

    const result = await sync.execute(
      syncRequest({ gameId: 'hexa-fit', score: undefined, results: [retry, next] }),
    );

    const stored = await progress.find(ADA, valueOf(GameId.of('hexa-fit')));
    expect(result.ok && result.value).toEqual(stored);
    expect(progressPartsOf(stored)?.highScore).toBeNull();
    expect(progressPartsOf(stored)?.results).toEqual([levelResultOf(retry), levelResultOf(next)]);
  });

  // DS-12 check: a better result and then a worse one for the same level
  // keep the better one, and the opposite order stores the same row. DS-4
  // gives the order: more stars, then fewer moves, then less time. A row
  // gives the two results in the order of the syncs. Both rows expect the
  // same stored progress.
  const betterResult = { levelId: 'fit-01', stars: 3, moves: 30, elapsedMs: 90000 };
  const worseResult = { levelId: 'fit-01', stars: 2, moves: 9, elapsedMs: 30000 };
  it.each([
    [betterResult, worseResult],
    [worseResult, betterResult],
  ])(
    'should_store_better_level_result_in_either_order_when_a_worse_result_of_same_level_syncs',
    async (first, second) => {
      await sync.execute(syncRequest({ gameId: 'hexa-fit', score: undefined, results: [first] }));

      const result = await sync.execute(
        syncRequest({ gameId: 'hexa-fit', score: undefined, results: [second] }),
      );

      const found = await progress.find(ADA, valueOf(GameId.of('hexa-fit')));
      expect(progressPartsOf(found)).toEqual({
        userId: ADA,
        gameId: valueOf(GameId.of('hexa-fit')),
        highScore: null,
        updatedAt: AT,
        results: [levelResultOf(betterResult)],
      });
      expect(result.ok && result.value).toEqual(found);
    },
  );

  // Two overlapping syncs run one after the other. The domain keeps the
  // highest score (API-FR-02, DS-12). The sync that runs last answers the
  // stored progress. A row gives the two scores in the order of the syncs.
  it.each([
    [500, 100],
    [100, 500],
  ])(
    'should_store_highest_score_in_either_order_when_two_syncs_of_same_game_overlap',
    async (firstScore, secondScore) => {
      const results = await Promise.all(
        [firstScore, secondScore].map((score) => sync.execute(syncRequest({ score }))),
      );

      const stored = await progress.find(ADA, valueOf(GameId.of('hexa-lines')));
      expect(progressPartsOf(stored)?.highScore?.equals(valueOf(Score.of(500)))).toBe(true);
      expect(results.map((result) => result.ok)).toEqual([true, true]);
      expect(results[1]?.ok && results[1].value).toEqual(stored);
    },
  );

  // Each sync reads the progress that the other one saved, so no level
  // result is lost (DEF-02). A row gives the two levels in the order of the syncs.
  const firstLevel = { levelId: 'fit-01', stars: 1, moves: 20, elapsedMs: 60000 };
  const secondLevel = { levelId: 'fit-02', stars: 3, moves: 9, elapsedMs: 30000 };
  it.each([
    [firstLevel, secondLevel],
    [secondLevel, firstLevel],
  ])(
    'should_store_both_levels_in_either_order_when_two_syncs_add_different_levels',
    async (first, second) => {
      const results = await Promise.all(
        [first, second].map((level) =>
          sync.execute(syncRequest({ gameId: 'hexa-fit', score: undefined, results: [level] })),
        ),
      );

      const stored = await progress.find(ADA, valueOf(GameId.of('hexa-fit')));
      // The port gives the results by levelId, whatever the sync order.
      expect(progressPartsOf(stored)?.results).toEqual([
        levelResultOf(firstLevel),
        levelResultOf(secondLevel),
      ]);
      // The answer of the last sync keeps the stored result first, then the new one.
      const last = results[1]?.ok ? results[1].value : null;
      expect(progressPartsOf(last)?.results).toEqual([levelResultOf(first), levelResultOf(second)]);
    },
  );

  // The stale sync starts first, but reaches the repository only after the
  // other sync saved. It reads the Clock under the lock, so updatedAt does
  // not move back (DEF-02).
  it('should_keep_latest_updated_at_when_a_stale_sync_saves_last', async () => {
    let openGate = (): void => {};
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    const held = new SyncProgressUseCase(
      intercepted(progress, () => gate),
      clock,
    );

    const stale = held.execute(syncRequest({ score: 500 }));
    clock.advanceBy(FIVE_MINUTES_MS);
    await sync.execute(syncRequest({ score: 100 }));
    openGate();
    const result = await stale;

    const stored = await progress.find(ADA, valueOf(GameId.of('hexa-lines')));
    expect(progressPartsOf(stored)?.highScore?.equals(valueOf(Score.of(500)))).toBe(true);
    expect(progressPartsOf(stored)?.updatedAt).toEqual(LATER);
    expect(result.ok && result.value).toEqual(stored);
  });

  // #97: the use case checks no instant. The Clock gives a SyncInstant, which
  // guards the rule of a valid instant. The types forbid a Clock that gives
  // another value, so it is a fault of the server, not of the request
  // (decision 11). The guard of the aggregate throws, so the client gets a
  // 500, not a 400.
  it('should_reject_and_save_nothing_when_clock_gives_no_sync_instant', async () => {
    const broken = new SyncProgressUseCase(progress, {
      now: () => new Date(Number.NaN) as unknown as SyncInstant,
    });
    const level = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 };
    await sync.execute(syncRequest({ gameId: 'hexa-fit', score: 120 }));

    await expect(broken.execute(syncRequest())).rejects.toThrow(
      new TypeError('The instant must be a SyncInstant.'),
    );
    await expect(
      broken.execute(syncRequest({ gameId: 'hexa-fit', score: 900, results: [level] })),
    ).rejects.toThrow(new TypeError('The instant must be a SyncInstant.'));
    expect(await progress.find(ADA, valueOf(GameId.of('hexa-lines')))).toBeNull();
    const stored = await progress.find(ADA, valueOf(GameId.of('hexa-fit')));
    expect(progressPartsOf(stored)?.highScore?.equals(valueOf(Score.of(120)))).toBe(true);
    expect(progressPartsOf(stored)?.updatedAt).toEqual(AT);
    expect(progressPartsOf(stored)?.results).toEqual([]);
  });

  // The request types forbid this value. The mapper of the border builds
  // every value, so a value that is not a Score is a defect of the caller.
  // The guard of the aggregate throws, and the use case saves nothing
  // (decision 11).
  it('should_throw_the_guard_and_keep_stored_progress_when_aggregate_rejects_a_request_value', async () => {
    await sync.execute(syncRequest({ score: 120 }));
    clock.advanceBy(FIVE_MINUTES_MS);

    await expect(
      sync.execute({
        ...syncRequest(),
        score: 500 as unknown as Score,
      }),
    ).rejects.toThrow(new TypeError('A high score must be a Score.'));
    const stored = await progress.find(ADA, valueOf(GameId.of('hexa-lines')));
    expect(progressPartsOf(stored)?.highScore?.equals(valueOf(Score.of(120)))).toBe(true);
    expect(progressPartsOf(stored)?.updatedAt).toEqual(AT);
  });
});
