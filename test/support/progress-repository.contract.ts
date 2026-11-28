import type { ProgressRepository } from '../../src/application/ports/progress-repository.js';
import { GameId } from '../../src/domain/shared/game-id.js';
import type { LevelResult } from '../../src/domain/progress/level-result.js';
import { PlayerProgress } from '../../src/domain/progress/player-progress.js';
import { ProgressKey } from '../../src/domain/progress/progress-key.js';
import { Score } from '../../src/domain/progress/score.js';
import { err, ok, type Result } from '../../src/domain/shared/result.js';
import type { SyncInstant } from '../../src/domain/progress/sync-instant.js';
import { UserId } from '../../src/domain/shared/user-id.js';
import { levelResultOf } from './level-results.js';
import { progressPartsOf } from './recording-receiver.js';
import { syncInstantOf } from './sync-instants.js';
import { valueOf } from './result.js';

// UUIDs, because the Drizzle adapter keys progress on users.id (#34). An
// adapter with a users table adds these users before the contract runs.
export const CONTRACT_USER_IDS = [
  '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01',
  '0b9e7f4a-5c3d-4e2b-8a1f-9c8d7e6f5a40',
] as const;
// No adapter stores this user.
const UNKNOWN_USER = valueOf(UserId.from('9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'));
const USER = valueOf(UserId.from(CONTRACT_USER_IDS[0]));
const OTHER_USER = valueOf(UserId.from(CONTRACT_USER_IDS[1]));
const FIT = valueOf(GameId.of('fit'));
const LINES = valueOf(GameId.of('lines'));
// The key of each progress: one progress per userId and gameId (#107).
const USER_FIT = ProgressKey.of(USER, FIT);
const USER_LINES = ProgressKey.of(USER, LINES);
const OTHER_USER_FIT = ProgressKey.of(OTHER_USER, FIT);
const UNKNOWN_USER_FIT = ProgressKey.of(UNKNOWN_USER, FIT);
const AT = syncInstantOf(new Date('2026-11-06T10:00:00.000Z'));
const LATER = syncInstantOf(new Date('2026-11-06T10:05:00.000Z'));

// A level result. A test names only the values that it needs.
function level(levelId: string, stars = 1, moves = 9, elapsedMs = 1): LevelResult {
  return levelResultOf({ levelId, stars, moves, elapsedMs });
}

// Stores a progress through the port: the change ignores the stored
// aggregate and returns the given one.
export function storeProgress(
  repository: ProgressRepository,
  progress: PlayerProgress,
): Promise<Result<PlayerProgress | null, 'unknown-user'>> {
  return repository.update(progressPartsOf(progress).key, () => progress);
}

// Contract of the ProgressRepository port: one progress per userId and
// gameId (API-FR-02). The in-memory fake and the Drizzle adapter (#34) run
// the same cases, so the fake promises nothing that the adapter breaks.
export function describeProgressRepositoryContract(
  name: string,
  createRepository: () => ProgressRepository | Promise<ProgressRepository>,
): void {
  describe(`ProgressRepository contract: ${name}`, () => {
    it('should_return_null_when_no_progress_is_saved_for_user_and_game', async () => {
      const repository = await createRepository();

      await expect(repository.find(USER_FIT)).resolves.toBeNull();
    });

    it('should_return_the_whole_aggregate_when_saved_progress_is_found', async () => {
      const repository = await createRepository();
      const progress = PlayerProgress.start(USER_FIT, AT);
      progress.recordScore(valueOf(Score.of(120)), LATER);
      progress.recordLevel(level('fit-01', 3), LATER);

      await storeProgress(repository, progress);
      // A key built again from equal parts finds the progress.
      const found = await repository.find(
        ProgressKey.of(valueOf(UserId.from(CONTRACT_USER_IDS[0])), valueOf(GameId.of('fit'))),
      );

      expect(progressPartsOf(found)?.key.equals(USER_FIT)).toBe(true);
      expect(progressPartsOf(found)?.highScore?.equals(valueOf(Score.of(120)))).toBe(true);
      expect(progressPartsOf(found)?.updatedAt).toEqual(LATER);
      expect(progressPartsOf(found)?.results).toEqual([level('fit-01', 3)]);
    });

    // The port promises the level results by levelId, compared as text:
    // fit-10 comes before fit-9. The Drizzle adapter sorts them in SQL.
    it('should_return_level_results_by_level_id_when_they_are_saved_out_of_order', async () => {
      const repository = await createRepository();
      const progress = PlayerProgress.start(USER_FIT, AT);
      for (const levelId of ['fit-9', 'fit-10', 'fit-01']) {
        progress.recordLevel(level(levelId), AT);
      }
      await storeProgress(repository, progress);
      const seen: (readonly LevelResult[])[] = [];

      const found = await repository.find(USER_FIT);
      await repository.update(USER_FIT, (stored) => {
        seen.push(stored === null ? [] : progressPartsOf(stored).results);
        return null;
      });

      const byLevelId = ['fit-01', 'fit-10', 'fit-9'].map((levelId) => level(levelId));
      expect(progressPartsOf(found)?.results).toEqual(byLevelId);
      expect(seen).toEqual([byLevelId]);
    });

    it('should_keep_one_entry_when_same_user_and_game_is_saved_twice', async () => {
      const repository = await createRepository();
      await storeProgress(repository, PlayerProgress.start(USER_FIT, AT));
      const second = PlayerProgress.start(USER_FIT, AT);
      second.recordScore(valueOf(Score.of(300)), LATER);

      await storeProgress(repository, second);

      expect(
        progressPartsOf(await repository.find(USER_FIT))?.highScore?.equals(valueOf(Score.of(300))),
      ).toBe(true);
    });

    // The Drizzle adapter writes rows and reads new objects. A repository
    // that keeps the saved object would show later changes as saved state.
    it('should_return_the_saved_state_when_an_aggregate_changes_after_save_or_find', async () => {
      const repository = await createRepository();
      const progress = PlayerProgress.start(USER_FIT, AT);
      progress.recordScore(valueOf(Score.of(120)), AT);
      progress.recordLevel(level('fit-01'), AT);
      await storeProgress(repository, progress);

      progress.recordScore(valueOf(Score.of(300)), LATER);
      progress.recordLevel(level('fit-02', 3, 5, 2), LATER);
      const found = await repository.find(USER_FIT);
      found?.recordScore(valueOf(Score.of(500)), LATER);
      const foundAgain = await repository.find(USER_FIT);

      expect(progressPartsOf(foundAgain)?.highScore?.equals(valueOf(Score.of(120)))).toBe(true);
      expect(progressPartsOf(foundAgain)?.updatedAt).toEqual(AT);
      expect(progressPartsOf(foundAgain)?.results).toEqual([level('fit-01')]);
    });

    // update() runs one change while it holds the lock of one userId and
    // gameId. With no stored progress, the change gets null.
    it('should_pass_null_to_change_and_save_its_result_when_no_progress_is_stored', async () => {
      const repository = await createRepository();
      const seen: (PlayerProgress | null)[] = [];
      const started = PlayerProgress.start(USER_FIT, AT);
      started.recordScore(valueOf(Score.of(120)), LATER);
      started.recordLevel(level('fit-01', 3), LATER);

      const saved = await repository.update(USER_FIT, (stored) => {
        seen.push(stored);
        return started;
      });

      expect(seen).toEqual([null]);
      expect(valueOf(saved)).toBe(started);
      const found = await repository.find(USER_FIT);
      expect(progressPartsOf(found)?.highScore?.equals(valueOf(Score.of(120)))).toBe(true);
      expect(progressPartsOf(found)?.updatedAt).toEqual(LATER);
      expect(progressPartsOf(found)?.results).toEqual([level('fit-01', 3)]);
      await expect(repository.find(USER_LINES)).resolves.toBeNull();
    });

    // The change gets a copy of the stored aggregate. The repository saves
    // what the change returns, as the aggregate holds it.
    it('should_pass_stored_aggregate_to_change_and_save_its_result_when_progress_is_stored', async () => {
      const repository = await createRepository();
      const first = PlayerProgress.start(USER_FIT, AT);
      first.recordScore(valueOf(Score.of(500)), AT);
      first.recordLevel(level('fit-01'), AT);
      await storeProgress(repository, first);
      const seen: {
        copy: boolean;
        score: Score | null;
        at: SyncInstant;
        levels: readonly LevelResult[];
      }[] = [];

      const saved = await repository.update(USER_FIT, (stored) => {
        if (stored === null) {
          return null;
        }
        seen.push({
          copy: stored !== first,
          score: progressPartsOf(stored).highScore,
          at: progressPartsOf(stored).updatedAt,
          levels: progressPartsOf(stored).results,
        });
        stored.recordScore(valueOf(Score.of(100)), LATER);
        stored.recordLevel(level('fit-02', 3, 5, 2), LATER);
        return stored;
      });

      expect(seen).toHaveLength(1);
      expect(seen[0]?.score?.equals(valueOf(Score.of(500)))).toBe(true);
      expect(seen[0]).toMatchObject({
        copy: true,
        at: AT,
        levels: [level('fit-01')],
      });
      const found = await repository.find(USER_FIT);
      expect(progressPartsOf(found)?.highScore?.equals(valueOf(Score.of(500)))).toBe(true);
      expect(progressPartsOf(found)?.updatedAt).toEqual(LATER);
      expect(progressPartsOf(found)?.results).toEqual([level('fit-01'), level('fit-02', 3, 5, 2)]);
      expect(progressPartsOf(valueOf(saved))?.highScore?.equals(valueOf(Score.of(500)))).toBe(true);
      expect(progressPartsOf(valueOf(saved))?.updatedAt).toEqual(LATER);
    });

    it('should_save_nothing_and_resolve_null_when_change_returns_null', async () => {
      const repository = await createRepository();
      const first = PlayerProgress.start(USER_FIT, AT);
      first.recordScore(valueOf(Score.of(500)), AT);
      first.recordLevel(level('fit-01'), AT);
      await storeProgress(repository, first);

      const kept = await repository.update(USER_FIT, (stored) => {
        stored?.recordScore(valueOf(Score.of(900)), LATER);
        stored?.recordLevel(level('fit-02', 3, 5, 2), LATER);
        return null;
      });
      const empty = await repository.update(USER_LINES, () => null);

      expect(kept).toEqual(ok(null));
      expect(empty).toEqual(ok(null));
      const found = await repository.find(USER_FIT);
      expect(progressPartsOf(found)?.highScore?.equals(valueOf(Score.of(500)))).toBe(true);
      expect(progressPartsOf(found)?.updatedAt).toEqual(AT);
      expect(progressPartsOf(found)?.results).toEqual([level('fit-01')]);
      await expect(repository.find(USER_LINES)).resolves.toBeNull();
    });

    it('should_save_nothing_and_reject_with_its_error_when_change_throws', async () => {
      const repository = await createRepository();
      const first = PlayerProgress.start(USER_FIT, AT);
      first.recordScore(valueOf(Score.of(500)), AT);
      first.recordLevel(level('fit-01'), AT);
      await storeProgress(repository, first);
      const failure = new Error('the change failed');

      const stored = repository.update(USER_FIT, (found) => {
        found?.recordScore(valueOf(Score.of(900)), LATER);
        found?.recordLevel(level('fit-02', 3, 5, 2), LATER);
        throw failure;
      });
      const empty = repository.update(USER_LINES, () => {
        throw failure;
      });

      await expect(stored).rejects.toBe(failure);
      await expect(empty).rejects.toBe(failure);
      const found = await repository.find(USER_FIT);
      expect(progressPartsOf(found)?.highScore?.equals(valueOf(Score.of(500)))).toBe(true);
      expect(progressPartsOf(found)?.updatedAt).toEqual(AT);
      expect(progressPartsOf(found)?.results).toEqual([level('fit-01')]);
      await expect(repository.find(USER_LINES)).resolves.toBeNull();
    });

    // Two updates of one key run one after the other: the second change
    // gets the result of the first. PGlite runs one session, so on Drizzle
    // this case shows the order, not the advisory lock.
    it('should_pass_first_result_to_second_change_when_two_updates_of_one_key_overlap', async () => {
      const repository = await createRepository();
      const seen: (readonly LevelResult[] | null)[] = [];
      const addLevel = (levelId: string) => (stored: PlayerProgress | null) => {
        seen.push(stored === null ? null : progressPartsOf(stored).results);
        const progress = stored ?? PlayerProgress.start(USER_FIT, AT);
        progress.recordLevel(level(levelId), AT);
        return progress;
      };

      await Promise.all([
        repository.update(USER_FIT, addLevel('fit-01')),
        repository.update(USER_FIT, addLevel('fit-02')),
      ]);

      expect(seen).toEqual([null, [level('fit-01')]]);
      const found = await repository.find(USER_FIT);
      expect(progressPartsOf(found)?.results).toEqual([level('fit-01'), level('fit-02')]);
    });

    // The user can go between the guard and the write. The write then
    // fails with unknown-user, a named failure, not an error (#137). A
    // change that saves nothing writes nothing, so it does not fail.
    it('should_fail_with_unknown_user_and_store_nothing_when_no_user_has_the_id_of_the_key', async () => {
      const repository = await createRepository();
      const progress = PlayerProgress.start(UNKNOWN_USER_FIT, AT);
      progress.recordLevel(level('fit-01', 3), AT);

      const saved = await repository.update(UNKNOWN_USER_FIT, () => progress);
      const unchanged = await repository.update(UNKNOWN_USER_FIT, () => null);

      expect(saved).toEqual(err('unknown-user'));
      expect(unchanged).toEqual(ok(null));
      await expect(repository.find(UNKNOWN_USER_FIT)).resolves.toBeNull();
    });

    it('should_keep_two_entries_when_one_user_saves_two_variants', async () => {
      const repository = await createRepository();
      const fit = PlayerProgress.start(USER_FIT, AT);
      fit.recordScore(valueOf(Score.of(10)), AT);
      const lines = PlayerProgress.start(USER_LINES, AT);
      lines.recordScore(valueOf(Score.of(20)), AT);

      await storeProgress(repository, fit);
      await storeProgress(repository, lines);

      expect(
        progressPartsOf(await repository.find(USER_FIT))?.highScore?.equals(valueOf(Score.of(10))),
      ).toBe(true);
      expect(
        progressPartsOf(await repository.find(USER_LINES))?.highScore?.equals(
          valueOf(Score.of(20)),
        ),
      ).toBe(true);
      await expect(repository.find(OTHER_USER_FIT)).resolves.toBeNull();
    });
  });
}
