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
    expect(result.ok && result.value).toBe(stored);
  });

  it('should_keep_one_progress_with_highest_score_when_same_game_syncs_twice', async () => {
    await sync.execute(syncRequest({ score: 120 }));
    clock.advanceBy(FIVE_MINUTES_MS);

    const result = await sync.execute(syncRequest({ score: 80 }));

    const stored = await progress.find(ADA, GameId.of('hexa-lines'));
    expect(result.ok && result.value).toBe(stored);
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
