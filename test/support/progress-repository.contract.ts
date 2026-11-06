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

      await repository.save(progress);
      const found = await repository.find(UserId.from(CONTRACT_USER_IDS[0]), GameId.of('fit'));

      expect(found?.userId.value).toBe(CONTRACT_USER_IDS[0]);
      expect(found?.gameId.value).toBe('fit');
      expect(found?.highScore).toBe(120);
      expect(found?.updatedAt.toISOString()).toBe(LATER.toISOString());
      expect(found?.results.map((result) => result.levelId)).toEqual(['fit-01']);
    });

    it('should_keep_one_entry_when_same_user_and_game_is_saved_twice', async () => {
      const repository = await createRepository();
      await repository.save(PlayerProgress.start(USER, FIT, AT));
      const second = PlayerProgress.start(USER, FIT, AT);
      second.recordScore(300, LATER);

      await repository.save(second);

      expect((await repository.find(USER, FIT))?.highScore).toBe(300);
    });

    // The Drizzle adapter writes rows and reads new objects. A repository
    // that keeps the saved object would show later changes as saved state.
    it('should_return_the_saved_state_when_an_aggregate_changes_after_save_or_find', async () => {
      const repository = await createRepository();
      const progress = PlayerProgress.start(USER, FIT, AT);
      progress.recordScore(120, AT);
      progress.recordLevel(LevelResult.of({ levelId: 'fit-01', stars: 1, moves: 9, elapsedMs: 1 }));
      await repository.save(progress);

      progress.recordScore(300, LATER);
      progress.recordLevel(LevelResult.of({ levelId: 'fit-02', stars: 3, moves: 5, elapsedMs: 2 }));
      const found = await repository.find(USER, FIT);
      found?.recordScore(500, LATER);
      const foundAgain = await repository.find(USER, FIT);

      expect(foundAgain?.highScore).toBe(120);
      expect(foundAgain?.updatedAt.toISOString()).toBe(AT.toISOString());
      expect(foundAgain?.results.map((result) => result.levelId)).toEqual(['fit-01']);
    });

    it('should_keep_two_entries_when_one_user_saves_two_variants', async () => {
      const repository = await createRepository();
      const fit = PlayerProgress.start(USER, FIT, AT);
      fit.recordScore(10, AT);
      const lines = PlayerProgress.start(USER, LINES, AT);
      lines.recordScore(20, AT);

      await repository.save(fit);
      await repository.save(lines);

      expect((await repository.find(USER, FIT))?.highScore).toBe(10);
      expect((await repository.find(USER, LINES))?.highScore).toBe(20);
      await expect(repository.find(OTHER_USER, FIT)).resolves.toBeNull();
    });
  });
}
