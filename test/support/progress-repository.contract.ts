import type { ProgressRepository } from '../../src/application/ports/progress-repository.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { LevelResult } from '../../src/domain/progress/level-result.js';
import { PlayerProgress } from '../../src/domain/progress/player-progress.js';
import { UserId } from '../../src/domain/user/user-id.js';

// UUIDs, because the Drizzle adapter keys progress on users.id (#34). An
// adapter with a users table adds these users before the contract runs.
export const CONTRACT_USER_IDS = [
  '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01',
  '0b9e7f4a-5c3d-4e2b-8a1f-9c8d7e6f5a40',
] as const;
const USER = UserId.from(CONTRACT_USER_IDS[0]);
const OTHER_USER = UserId.from(CONTRACT_USER_IDS[1]);
const FIT = GameId.of('fit');
const LINES = GameId.of('lines');
const AT = new Date('2026-11-06T10:00:00.000Z');
const LATER = new Date('2026-11-06T10:05:00.000Z');

// Stores a progress through the port: the change ignores the stored
// aggregate and returns the given one.
export function storeProgress(
  repository: ProgressRepository,
  progress: PlayerProgress,
): Promise<PlayerProgress | null> {
  return repository.update(progress.userId, progress.gameId, () => progress);
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

      await expect(repository.find(USER, FIT)).resolves.toBeNull();
    });

    it('should_return_the_whole_aggregate_when_saved_progress_is_found', async () => {
      const repository = await createRepository();
      const progress = PlayerProgress.start(USER, FIT, AT);
      progress.recordScore(120, LATER);
      progress.recordLevel(LevelResult.of({ levelId: 'fit-01', stars: 3, moves: 9, elapsedMs: 1 }));

      await storeProgress(repository, progress);
      const found = await repository.find(UserId.from(CONTRACT_USER_IDS[0]), GameId.of('fit'));

      expect(found?.userId.value).toBe(CONTRACT_USER_IDS[0]);
      expect(found?.gameId.value).toBe('fit');
      expect(found?.highScore).toBe(120);
      expect(found?.updatedAt.toISOString()).toBe(LATER.toISOString());
      expect(found?.results.map((result) => result.levelId)).toEqual(['fit-01']);
    });

    // The port promises the level results by levelId, compared as text:
    // fit-10 comes before fit-9. The Drizzle adapter sorts them in SQL.
    it('should_return_level_results_by_level_id_when_they_are_saved_out_of_order', async () => {
      const repository = await createRepository();
      const progress = PlayerProgress.start(USER, FIT, AT);
      for (const levelId of ['fit-9', 'fit-10', 'fit-01']) {
        progress.recordLevel(LevelResult.of({ levelId, stars: 1, moves: 9, elapsedMs: 1 }));
      }
      await storeProgress(repository, progress);
      const seen: string[][] = [];

      const found = await repository.find(USER, FIT);
      await repository.update(USER, FIT, (stored) => {
        seen.push(stored === null ? [] : stored.results.map((result) => result.levelId));
        return null;
      });

      expect(found?.results.map((result) => result.levelId)).toEqual(['fit-01', 'fit-10', 'fit-9']);
      expect(seen).toEqual([['fit-01', 'fit-10', 'fit-9']]);
    });

    it('should_keep_one_entry_when_same_user_and_game_is_saved_twice', async () => {
      const repository = await createRepository();
      await storeProgress(repository, PlayerProgress.start(USER, FIT, AT));
      const second = PlayerProgress.start(USER, FIT, AT);
      second.recordScore(300, LATER);

      await storeProgress(repository, second);

      expect((await repository.find(USER, FIT))?.highScore).toBe(300);
    });

    // The Drizzle adapter writes rows and reads new objects. A repository
    // that keeps the saved object would show later changes as saved state.
    it('should_return_the_saved_state_when_an_aggregate_changes_after_save_or_find', async () => {
      const repository = await createRepository();
      const progress = PlayerProgress.start(USER, FIT, AT);
      progress.recordScore(120, AT);
      progress.recordLevel(LevelResult.of({ levelId: 'fit-01', stars: 1, moves: 9, elapsedMs: 1 }));
      await storeProgress(repository, progress);

      progress.recordScore(300, LATER);
      progress.recordLevel(LevelResult.of({ levelId: 'fit-02', stars: 3, moves: 5, elapsedMs: 2 }));
      const found = await repository.find(USER, FIT);
      found?.recordScore(500, LATER);
      const foundAgain = await repository.find(USER, FIT);

      expect(foundAgain?.highScore).toBe(120);
      expect(foundAgain?.updatedAt.toISOString()).toBe(AT.toISOString());
      expect(foundAgain?.results.map((result) => result.levelId)).toEqual(['fit-01']);
    });

    // update() runs one change while it holds the lock of one userId and
    // gameId. With no stored progress, the change gets null.
    it('should_pass_null_to_change_and_save_its_result_when_no_progress_is_stored', async () => {
      const repository = await createRepository();
      const seen: (PlayerProgress | null)[] = [];
      const started = PlayerProgress.start(USER, FIT, AT);
      started.recordScore(120, LATER);
      started.recordLevel(LevelResult.of({ levelId: 'fit-01', stars: 3, moves: 9, elapsedMs: 1 }));

      const saved = await repository.update(USER, FIT, (stored) => {
        seen.push(stored);
        return started;
      });

      expect(seen).toEqual([null]);
      expect(saved).toBe(started);
      const found = await repository.find(USER, FIT);
      expect(found?.highScore).toBe(120);
      expect(found?.updatedAt.toISOString()).toBe(LATER.toISOString());
      expect(found?.results.map((result) => result.levelId)).toEqual(['fit-01']);
      await expect(repository.find(USER, LINES)).resolves.toBeNull();
    });

    // The change gets a copy of the stored aggregate. The repository saves
    // what the change returns, as the aggregate holds it.
    it('should_pass_stored_aggregate_to_change_and_save_its_result_when_progress_is_stored', async () => {
      const repository = await createRepository();
      const first = PlayerProgress.start(USER, FIT, AT);
      first.recordScore(500, AT);
      first.recordLevel(LevelResult.of({ levelId: 'fit-01', stars: 1, moves: 9, elapsedMs: 1 }));
      await storeProgress(repository, first);
      const seen: { copy: boolean; score: number | null; at: string; levels: string[] }[] = [];

      const saved = await repository.update(USER, FIT, (stored) => {
        if (stored === null) {
          return null;
        }
        seen.push({
          copy: stored !== first,
          score: stored.highScore,
          at: stored.updatedAt.toISOString(),
          levels: stored.results.map((result) => result.levelId),
        });
        stored.recordScore(100, LATER);
        stored.recordLevel(LevelResult.of({ levelId: 'fit-02', stars: 3, moves: 5, elapsedMs: 2 }));
        return stored;
      });

      expect(seen).toEqual([{ copy: true, score: 500, at: AT.toISOString(), levels: ['fit-01'] }]);
      const found = await repository.find(USER, FIT);
      expect(found?.highScore).toBe(500);
      expect(found?.updatedAt.toISOString()).toBe(LATER.toISOString());
      expect(found?.results.map((result) => result.levelId)).toEqual(['fit-01', 'fit-02']);
      expect(saved?.highScore).toBe(500);
      expect(saved?.updatedAt.toISOString()).toBe(LATER.toISOString());
    });

    it('should_save_nothing_and_resolve_null_when_change_returns_null', async () => {
      const repository = await createRepository();
      const first = PlayerProgress.start(USER, FIT, AT);
      first.recordScore(500, AT);
      first.recordLevel(LevelResult.of({ levelId: 'fit-01', stars: 1, moves: 9, elapsedMs: 1 }));
      await storeProgress(repository, first);

      const kept = await repository.update(USER, FIT, (stored) => {
        stored?.recordScore(900, LATER);
        stored?.recordLevel(
          LevelResult.of({ levelId: 'fit-02', stars: 3, moves: 5, elapsedMs: 2 }),
        );
        return null;
      });
      const empty = await repository.update(USER, LINES, () => null);

      expect(kept).toBeNull();
      expect(empty).toBeNull();
      const found = await repository.find(USER, FIT);
      expect(found?.highScore).toBe(500);
      expect(found?.updatedAt.toISOString()).toBe(AT.toISOString());
      expect(found?.results.map((result) => result.levelId)).toEqual(['fit-01']);
      await expect(repository.find(USER, LINES)).resolves.toBeNull();
    });

    it('should_save_nothing_and_reject_with_its_error_when_change_throws', async () => {
      const repository = await createRepository();
      const first = PlayerProgress.start(USER, FIT, AT);
      first.recordScore(500, AT);
      first.recordLevel(LevelResult.of({ levelId: 'fit-01', stars: 1, moves: 9, elapsedMs: 1 }));
      await storeProgress(repository, first);
      const failure = new Error('the change failed');

      const stored = repository.update(USER, FIT, (found) => {
        found?.recordScore(900, LATER);
        found?.recordLevel(LevelResult.of({ levelId: 'fit-02', stars: 3, moves: 5, elapsedMs: 2 }));
        throw failure;
      });
      const empty = repository.update(USER, LINES, () => {
        throw failure;
      });

      await expect(stored).rejects.toBe(failure);
      await expect(empty).rejects.toBe(failure);
      const found = await repository.find(USER, FIT);
      expect(found?.highScore).toBe(500);
      expect(found?.updatedAt.toISOString()).toBe(AT.toISOString());
      expect(found?.results.map((result) => result.levelId)).toEqual(['fit-01']);
      await expect(repository.find(USER, LINES)).resolves.toBeNull();
    });

    // Two updates of one key run one after the other: the second change
    // gets the result of the first. PGlite runs one session, so on Drizzle
    // this case shows the order, not the advisory lock.
    it('should_pass_first_result_to_second_change_when_two_updates_of_one_key_overlap', async () => {
      const repository = await createRepository();
      const seen: (string[] | null)[] = [];
      const addLevel = (levelId: string) => (stored: PlayerProgress | null) => {
        seen.push(stored === null ? null : stored.results.map((result) => result.levelId));
        const progress = stored ?? PlayerProgress.start(USER, FIT, AT);
        progress.recordLevel(LevelResult.of({ levelId, stars: 1, moves: 9, elapsedMs: 1 }));
        return progress;
      };

      await Promise.all([
        repository.update(USER, FIT, addLevel('fit-01')),
        repository.update(USER, FIT, addLevel('fit-02')),
      ]);

      expect(seen).toEqual([null, ['fit-01']]);
      const found = await repository.find(USER, FIT);
      expect(found?.results.map((result) => result.levelId)).toEqual(['fit-01', 'fit-02']);
    });

    it('should_keep_two_entries_when_one_user_saves_two_variants', async () => {
      const repository = await createRepository();
      const fit = PlayerProgress.start(USER, FIT, AT);
      fit.recordScore(10, AT);
      const lines = PlayerProgress.start(USER, LINES, AT);
      lines.recordScore(20, AT);

      await storeProgress(repository, fit);
      await storeProgress(repository, lines);

      expect((await repository.find(USER, FIT))?.highScore).toBe(10);
      expect((await repository.find(USER, LINES))?.highScore).toBe(20);
      await expect(repository.find(OTHER_USER, FIT)).resolves.toBeNull();
    });
  });
}
