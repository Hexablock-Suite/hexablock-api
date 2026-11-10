import type { ProgressRepository } from '../../../src/application/ports/progress-repository.js';
import {
  type SyncProgressRequest,
  SyncProgressUseCase,
} from '../../../src/application/progress/sync-progress.use-case.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelResult, type LevelResultValues } from '../../../src/domain/progress/level-result.js';
import { Score } from '../../../src/domain/progress/score.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { InMemoryProgressRepository } from '../../support/in-memory-progress-repository.js';
import { testUserId } from '../../support/user-ids.js';

const ADA = UserId.from(testUserId(1));
const AT = new Date('2026-11-06T10:00:00.000Z');
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const LATER = new Date(AT.getTime() + FIVE_MINUTES_MS);

// Builds the request as the mapper of the border does: the use case gets
// domain values. A call with no score key sends a score of 120.
function syncRequest(
  values: { gameId?: string; score?: number; results?: LevelResultValues[] } = {},
): SyncProgressRequest {
  const { gameId = 'hexa-lines', results = [] } = values;
  const score = 'score' in values ? values.score : 120;
  return {
    userId: ADA,
    gameId: GameId.of(gameId),
    score: score === undefined ? undefined : Score.of(score),
    results: results.map((result) => LevelResult.of(result)),
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
    const stored = await progress.find(ADA, GameId.of('hexa-lines'));
    expect(stored).not.toBeNull();
    expect(stored?.highScore?.equals(Score.of(120))).toBe(true);
    expect(stored?.updatedAt).toEqual(AT);
    expect(stored?.results).toEqual([]);
    expect(result.ok && result.value).toEqual(stored);
  });

  it('should_keep_one_progress_with_highest_score_when_same_game_syncs_twice', async () => {
    await sync.execute(syncRequest({ score: 120 }));
    clock.advanceBy(FIVE_MINUTES_MS);

    const result = await sync.execute(syncRequest({ score: 80 }));

    const stored = await progress.find(ADA, GameId.of('hexa-lines'));
    expect(result.ok && result.value).toEqual(stored);
    expect(stored?.highScore?.equals(Score.of(120))).toBe(true);
    expect(stored?.updatedAt).toEqual(LATER);
  });

  it('should_keep_separate_progress_when_user_syncs_two_games', async () => {
    await sync.execute(syncRequest({ gameId: 'hexa-lines', score: 120 }));
    await sync.execute(syncRequest({ gameId: 'hexa-merge', score: 300 }));

    expect(
      (await progress.find(ADA, GameId.of('hexa-lines')))?.highScore?.equals(Score.of(120)),
    ).toBe(true);
    expect(
      (await progress.find(ADA, GameId.of('hexa-merge')))?.highScore?.equals(Score.of(300)),
    ).toBe(true);
  });

  it('should_record_level_results_without_score_when_request_has_only_results', async () => {
    const level = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 };

    const result = await sync.execute(
      syncRequest({ gameId: 'hexa-fit', score: undefined, results: [level] }),
    );

    expect(result.ok).toBe(true);
    const stored = await progress.find(ADA, GameId.of('hexa-fit'));
    expect(stored?.highScore).toBeNull();
    expect(stored?.updatedAt).toEqual(AT);
    expect(stored?.results).toEqual([LevelResult.of(level)]);
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

    const stored = await progress.find(ADA, GameId.of('hexa-fit'));
    expect(result.ok && result.value).toEqual(stored);
    expect(stored?.highScore).toBeNull();
    expect(stored?.results).toEqual([LevelResult.of(retry), LevelResult.of(next)]);
  });

  // DS-12 check: a better result and then a worse one for the same level
  // keep the better one, and the opposite order stores the same row. DS-4
  // gives the order: more stars, then fewer moves, then less time.
  it('should_store_better_level_result_in_either_order_when_a_worse_result_of_same_level_syncs', async () => {
    const better = { levelId: 'fit-01', stars: 3, moves: 30, elapsedMs: 90000 };
    const worse = { levelId: 'fit-01', stars: 2, moves: 9, elapsedMs: 30000 };
    const stored: unknown[] = [];
    for (const levels of [
      [better, worse],
      [worse, better],
    ]) {
      const repository = new InMemoryProgressRepository();
      const ordered = new SyncProgressUseCase(repository, clock);

      const results = [];
      for (const level of levels) {
        results.push(
          await ordered.execute(
            syncRequest({ gameId: 'hexa-fit', score: undefined, results: [level] }),
          ),
        );
      }

      const found = await repository.find(ADA, GameId.of('hexa-fit'));
      expect(found?.results).toEqual([LevelResult.of(better)]);
      expect(results[1]?.ok && results[1].value).toEqual(found);
      stored.push(found);
    }
    expect(stored[1]).toEqual(stored[0]);
  });

  // Two overlapping syncs run one after the other. The domain keeps the
  // highest score (API-FR-02, DS-12). The sync that runs last answers the
  // stored progress.
  it('should_store_highest_score_in_either_order_when_two_syncs_of_same_game_overlap', async () => {
    for (const scores of [
      [500, 100],
      [100, 500],
    ]) {
      const repository = new InMemoryProgressRepository();
      const overlapping = new SyncProgressUseCase(repository, clock);

      const results = await Promise.all(
        scores.map((score) => overlapping.execute(syncRequest({ score }))),
      );

      const stored = await repository.find(ADA, GameId.of('hexa-lines'));
      expect(stored?.highScore?.equals(Score.of(500))).toBe(true);
      expect(results.map((result) => result.ok)).toEqual([true, true]);
      expect(results[1]?.ok && results[1].value).toEqual(stored);
    }
  });

  // Each sync reads the progress that the other one saved, so no level
  // result is lost (DEF-02).
  it('should_store_both_levels_in_either_order_when_two_syncs_add_different_levels', async () => {
    const first = { levelId: 'fit-01', stars: 1, moves: 20, elapsedMs: 60000 };
    const second = { levelId: 'fit-02', stars: 3, moves: 9, elapsedMs: 30000 };
    for (const levels of [
      [first, second],
      [second, first],
    ]) {
      const repository = new InMemoryProgressRepository();
      const overlapping = new SyncProgressUseCase(repository, clock);

      const results = await Promise.all(
        levels.map((level) =>
          overlapping.execute(
            syncRequest({ gameId: 'hexa-fit', score: undefined, results: [level] }),
          ),
        ),
      );

      const stored = await repository.find(ADA, GameId.of('hexa-fit'));
      // The port gives the results by levelId, whatever the sync order.
      expect(stored?.results).toEqual([first, second].map((level) => LevelResult.of(level)));
      // The answer of the last sync keeps the stored result first, then the new one.
      const last = results[1]?.ok ? results[1].value : null;
      expect(last?.results).toEqual(levels.map((level) => LevelResult.of(level)));
    }
  });

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

    const stored = await progress.find(ADA, GameId.of('hexa-lines'));
    expect(stored?.highScore?.equals(Score.of(500))).toBe(true);
    expect(stored?.updatedAt).toEqual(LATER);
    expect(result.ok && result.value).toEqual(stored);
  });

  // A broken Clock is a fault of the server, not of the request (decision 11).
  // The use case throws, so the client gets a 500, not a 400.
  it('should_reject_and_save_nothing_when_clock_returns_an_invalid_date', async () => {
    const broken = new SyncProgressUseCase(progress, new FixedClock(new Date(Number.NaN)));
    const level = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 };
    await sync.execute(syncRequest({ gameId: 'hexa-fit', score: 120 }));

    await expect(broken.execute(syncRequest())).rejects.toThrow(
      'The Clock must return a valid Date.',
    );
    await expect(
      broken.execute(syncRequest({ gameId: 'hexa-fit', score: 900, results: [level] })),
    ).rejects.toThrow('The Clock must return a valid Date.');
    expect(await progress.find(ADA, GameId.of('hexa-lines'))).toBeNull();
    const stored = await progress.find(ADA, GameId.of('hexa-fit'));
    expect(stored?.highScore?.equals(Score.of(120))).toBe(true);
    expect(stored?.updatedAt).toEqual(AT);
    expect(stored?.results).toEqual([]);
  });

  // The request types forbid this value. The aggregate still guards its
  // rule, and the broken rule comes back as a failed Result (decision 11).
  it('should_fail_with_invalid_progress_and_keep_stored_progress_when_aggregate_rejects_a_request_value', async () => {
    await sync.execute(syncRequest({ score: 120 }));
    clock.advanceBy(FIVE_MINUTES_MS);

    const result = await sync.execute({
      ...syncRequest(),
      score: 500 as unknown as Score,
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'invalid-progress', problems: ['A high score must be a Score.'] },
    });
    const stored = await progress.find(ADA, GameId.of('hexa-lines'));
    expect(stored?.highScore?.equals(Score.of(120))).toBe(true);
    expect(stored?.updatedAt).toEqual(AT);
  });
});
