import type { ProgressRepository } from '../../../src/application/ports/progress-repository.js';
import {
  type SyncProgressRequest,
  SyncProgressUseCase,
} from '../../../src/application/progress/sync-progress.use-case.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelResult } from '../../../src/domain/progress/level-result.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { InMemoryProgressRepository } from '../../support/in-memory-progress-repository.js';

const ADA = UserId.from('user-1');
const AT = new Date('2026-11-06T10:00:00.000Z');
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const LATER = new Date(AT.getTime() + FIVE_MINUTES_MS);

function syncRequest(overrides: Partial<SyncProgressRequest> = {}): SyncProgressRequest {
  return { userId: ADA, gameId: 'hexa-lines', score: 120, results: [], ...overrides };
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
    expect(stored?.highScore).toBe(120);
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
    expect(stored?.highScore).toBe(120);
    expect(stored?.updatedAt).toEqual(LATER);
  });

  it('should_keep_separate_progress_when_user_syncs_two_games', async () => {
    await sync.execute(syncRequest({ gameId: 'hexa-lines', score: 120 }));
    await sync.execute(syncRequest({ gameId: 'hexa-merge', score: 300 }));

    expect((await progress.find(ADA, GameId.of('hexa-lines')))?.highScore).toBe(120);
    expect((await progress.find(ADA, GameId.of('hexa-merge')))?.highScore).toBe(300);
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

  // The DTO says: a later result for a levelId replaces the earlier one.
  it('should_replace_level_result_and_keep_other_levels_when_stored_progress_syncs_again', async () => {
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

  it('should_fail_with_invalid_progress_and_save_nothing_when_game_id_is_not_a_slug', async () => {
    const result = await sync.execute(syncRequest({ gameId: 'Hexa Lines' }));

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'invalid-progress',
        problems: ['gameId must be a lowercase slug, got "Hexa Lines".'],
      },
    });
  });

  it('should_fail_with_invalid_progress_and_keep_stored_progress_when_score_is_negative', async () => {
    await sync.execute(syncRequest({ score: 120 }));
    clock.advanceBy(FIVE_MINUTES_MS);

    const result = await sync.execute(syncRequest({ score: -1 }));

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'invalid-progress',
        problems: ['score must be a non-negative integer, got -1.'],
      },
    });
    const stored = await progress.find(ADA, GameId.of('hexa-lines'));
    expect(stored?.highScore).toBe(120);
    expect(stored?.updatedAt).toEqual(AT);
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
      expect(stored?.highScore).toBe(500);
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
      expect(results[1]?.ok && results[1].value).toEqual(stored);
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
    expect(stored?.highScore).toBe(500);
    expect(stored?.updatedAt).toEqual(LATER);
    expect(result.ok && result.value).toEqual(stored);
  });

  // The use case checks the gameId and each LevelResult before it calls
  // the repository.
  it('should_call_no_repository_method_when_request_breaks_a_value_rule', async () => {
    const calls: string[] = [];
    const recorded = new SyncProgressUseCase(
      intercepted(progress, (method) => {
        calls.push(method);
        return Promise.resolve();
      }),
      clock,
    );

    const badGame = await recorded.execute(syncRequest({ gameId: 'Hexa Lines' }));
    const badLevel = await recorded.execute(
      syncRequest({ results: [{ levelId: 'fit-01', stars: -2, moves: 12, elapsedMs: 45000 }] }),
    );

    expect(badGame.ok).toBe(false);
    expect(badLevel.ok).toBe(false);
    expect(calls).toEqual([]);
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
    expect(stored?.highScore).toBe(120);
    expect(stored?.updatedAt).toEqual(AT);
    expect(stored?.results).toEqual([]);
  });

  it('should_fail_with_invalid_progress_and_save_nothing_when_level_result_breaks_a_rule', async () => {
    const result = await sync.execute(
      syncRequest({
        gameId: 'hexa-fit',
        results: [{ levelId: 'fit-01', stars: -2, moves: 12, elapsedMs: 45000 }],
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'invalid-progress',
        problems: ['stars must be a non-negative integer, got -2.'],
      },
    });
    expect(await progress.find(ADA, GameId.of('hexa-fit'))).toBeNull();
  });
});
