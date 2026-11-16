import type {
  LevelChange,
  LevelRepository,
} from '../../../src/application/ports/level-repository.js';
import {
  type UpdateLevelsRequest,
  UpdateLevelsUseCase,
} from '../../../src/application/levels/update-levels.use-case.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import { InMemoryLevelRepository } from '../../support/in-memory-level-repository.js';
import { levelJson, levelValidators, type LevelJson } from '../../support/level-format.js';
import { a5FailingFitJson, incomingLevel } from '../../support/level-update.js';
import { listedJson, storeLevel } from '../../support/level-repository.contract.js';
import { valueOf } from '../../support/result.js';

// The request of a batch, built as LevelDtoMapper builds it.
function batchOf(...levels: LevelJson[]): UpdateLevelsRequest {
  return { levels: levels.map((json) => incomingLevel(json)) };
}

// A failed Result of UpdateLevels: the kind and one problem per broken level.
function invalidLevels(...problems: [gameId: string, levelId: string, problem: string][]) {
  return {
    ok: false,
    error: {
      kind: 'invalid-levels',
      problems: problems.map(([gameId, levelId, problem]) => ({
        gameId: valueOf(GameId.of(gameId)),
        levelId: valueOf(LevelId.of(levelId)),
        problem,
      })),
    },
  };
}

// The update of API-FR-04 (#81). The use case checks every level of the
// batch through LevelValidators before it saves any level. Then it saves
// level by level, each in its own transaction, through
// LevelRepository.update(). The change of each update runs the version rule
// of S3-10, so a lower version fails and an equal version passes.
describe('UpdateLevelsUseCase (API-FR-04)', () => {
  let levels: InMemoryLevelRepository;
  let update: UpdateLevelsUseCase;

  beforeEach(() => {
    levels = new InMemoryLevelRepository(levelValidators());
    update = new UpdateLevelsUseCase(levels, levelValidators());
  });

  it('should_save_every_level_when_each_level_of_the_batch_passes_its_check', async () => {
    const result = await update.execute(batchOf(levelJson('hexa-sort'), levelJson('hexa-fit')));

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await listedJson(levels)).toEqual([levelJson('hexa-fit'), levelJson('hexa-sort')]);
  });

  // An empty batch breaks no rule, so it succeeds and saves nothing.
  it('should_succeed_and_save_nothing_when_the_batch_holds_no_level', async () => {
    const save = vi.spyOn(levels, 'update');

    const result = await update.execute({ levels: [] });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(save).not.toHaveBeenCalled();
    expect(await listedJson(levels)).toEqual([]);
  });

  // The whole batch passes its check before the first save. So a broken
  // level leaves every stored level as it was, also the levels of the
  // batch that pass their check. Each broken level gives one problem.
  it('should_save_no_level_and_report_each_broken_level_when_a_fit_level_of_the_batch_fails_a5', async () => {
    await storeLevel(levels, levelJson('hexa-sort'));
    const save = vi.spyOn(levels, 'update');
    const lines = { ...levelJson('hexa-sort', 'lines-01'), gameId: 'hexa-lines' };

    const result = await update.execute(
      batchOf(levelJson('hexa-sort', 'sort-01', 2), a5FailingFitJson(), lines),
    );

    expect(result).toEqual(
      invalidLevels(
        ['hexa-fit', 'fit-01', 'inexact-witness'],
        ['hexa-lines', 'lines-01', 'game-without-levels'],
      ),
    );
    expect(save).not.toHaveBeenCalled();
    expect(await listedJson(levels)).toEqual([levelJson('hexa-sort')]);
  });

  // The version rule runs inside update(), under the lock of the level. A
  // lower version saves nothing for that level. Each level is its own
  // aggregate, so the other levels of the batch are saved.
  it('should_reject_the_lower_version_and_save_the_other_levels_when_a_stored_level_is_newer', async () => {
    await storeLevel(levels, levelJson('hexa-fit', 'fit-01', 2));

    const result = await update.execute(
      batchOf(levelJson('hexa-fit', 'fit-01', 1), levelJson('hexa-sort')),
    );

    expect(result).toEqual(invalidLevels(['hexa-fit', 'fit-01', 'older-version']));
    expect(await listedJson(levels)).toEqual([
      levelJson('hexa-fit', 'fit-01', 2),
      levelJson('hexa-sort'),
    ]);
  });

  // S3-10: an equal version passes, so a repeated batch is safe.
  it('should_accept_the_equal_version_and_keep_each_level_when_the_same_batch_is_sent_again', async () => {
    const batch = batchOf(levelJson('hexa-fit'), levelJson('hexa-sort'));
    await update.execute(batch);

    const again = await update.execute(batch);

    expect(again).toEqual({ ok: true, value: undefined });
    expect(await listedJson(levels)).toEqual([levelJson('hexa-fit'), levelJson('hexa-sort')]);
  });

  // Each level is saved in its own transaction. A save that throws stops
  // the batch and keeps the levels saved before it. A retry of the same
  // batch saves each level again: an equal version passes.
  it('should_keep_the_levels_saved_before_a_failed_save_and_save_every_level_when_the_batch_is_retried', async () => {
    const failure = new Error('the connection is lost');
    let calls = 0;
    const flaky: LevelRepository = {
      list: () => levels.list(),
      update: (gameId: GameId, levelId: LevelId, change: LevelChange) => {
        calls += 1;
        return calls === 2 ? Promise.reject(failure) : levels.update(gameId, levelId, change);
      },
    };
    const flakyUpdate = new UpdateLevelsUseCase(flaky, levelValidators());
    const batch = batchOf(
      levelJson('hexa-fit'),
      levelJson('hexa-sort'),
      levelJson('hexa-fit', 'fit-02'),
    );

    const failed = flakyUpdate.execute(batch);
    await expect(failed).rejects.toBe(failure);
    const afterFailure = await listedJson(levels);
    const retried = await flakyUpdate.execute(batch);

    expect(afterFailure).toEqual([levelJson('hexa-fit')]);
    expect(retried).toEqual({ ok: true, value: undefined });
    expect(await listedJson(levels)).toEqual([
      levelJson('hexa-fit'),
      levelJson('hexa-fit', 'fit-02'),
      levelJson('hexa-sort'),
    ]);
  });

  // Two updates can race between the check and the save. The newer update
  // saves first here. The version rule runs again inside update(), so the
  // older update loses, and the use case reports a level problem, not an
  // error.
  it('should_report_older_version_for_the_losing_update_when_a_newer_update_saves_between_its_check_and_its_save', async () => {
    await storeLevel(levels, levelJson('hexa-fit', 'fit-01', 1));
    const newer = new UpdateLevelsUseCase(levels, levelValidators());
    const racing: LevelRepository = {
      list: () => levels.list(),
      update: async (gameId: GameId, levelId: LevelId, change: LevelChange) => {
        await newer.execute(batchOf(levelJson('hexa-fit', 'fit-01', 3)));
        return levels.update(gameId, levelId, change);
      },
    };
    const older = new UpdateLevelsUseCase(racing, levelValidators());

    const result = await older.execute(batchOf(levelJson('hexa-fit', 'fit-01', 2)));

    expect(result).toEqual(invalidLevels(['hexa-fit', 'fit-01', 'older-version']));
    expect(await listedJson(levels)).toEqual([levelJson('hexa-fit', 'fit-01', 3)]);
  });
});
