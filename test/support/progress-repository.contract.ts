import type { ProgressRepository } from '../../src/application/ports/progress-repository.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { LevelResult } from '../../src/domain/progress/level-result.js';
import { PlayerProgress } from '../../src/domain/progress/player-progress.js';
import { UserId } from '../../src/domain/progress/user-id.js';

const USER = UserId.of('user-1');
const OTHER_USER = UserId.of('user-2');
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
      const found = await repository.find(UserId.of('user-1'), GameId.of('fit'));

      expect(found?.userId.value).toBe('user-1');
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
