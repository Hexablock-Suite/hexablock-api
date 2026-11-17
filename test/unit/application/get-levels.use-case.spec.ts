import { receiveJsonOf } from '../../../src/adapters/received.js';
import { GetLevelsUseCase } from '../../../src/application/levels/get-levels.use-case.js';
import type { Logger, UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import { InMemoryLevelRepository } from '../../support/in-memory-level-repository.js';
import { levelJson, levelValidators } from '../../support/level-format.js';
import { brokenRow, storeLevel } from '../../support/level-repository.contract.js';

// Test double for the Logger port. It keeps each entry in the order of the writes.
class RecordingLogger implements Logger {
  readonly entries: UseCaseLogEntry[] = [];

  log(entry: UseCaseLogEntry): void {
    this.entries.push(entry);
  }
}

// The read of API-FR-04 (#81). It gives every valid stored level in the
// order of LevelRepository.list(): by gameId, then by levelId, compared as
// text. #147: it gives each stored row that breaks a rule apart, and it logs
// one entry per such row.
describe('GetLevelsUseCase (API-FR-04)', () => {
  let levels: InMemoryLevelRepository;
  let logger: RecordingLogger;

  beforeEach(() => {
    levels = new InMemoryLevelRepository(levelValidators());
    logger = new RecordingLogger();
  });

  it('should_give_every_stored_level_by_game_and_level_id_when_levels_are_stored', async () => {
    const stored = [
      levelJson('hexa-sort'),
      levelJson('hexa-fit', 'fit-9'),
      levelJson('hexa-fit', 'fit-10', 2),
    ];
    for (const json of stored) {
      await storeLevel(levels, json);
    }

    const result = await new GetLevelsUseCase(levels, logger).execute();

    if (!result.ok) {
      throw new Error('GetLevels has no expected failure.');
    }
    expect(result.value.levels.map((level) => receiveJsonOf(level))).toEqual([
      stored[2],
      stored[1],
      stored[0],
    ]);
    expect(result.value.unavailable).toEqual([]);
    expect(logger.entries).toEqual([]);
  });

  it('should_give_no_level_when_no_level_is_stored', async () => {
    const result = await new GetLevelsUseCase(levels, logger).execute();

    expect(result).toEqual({ ok: true, value: { levels: [], unavailable: [] } });
    expect(logger.entries).toEqual([]);
  });

  // A broken row does not hide the other levels. The read gives its key and
  // the code of its rule, and the log gets one entry with the same data.
  it('should_give_the_valid_levels_and_each_broken_row_and_log_each_broken_row_when_a_stored_row_breaks_a_rule', async () => {
    levels.storeRow(brokenRow(levelJson('hexa-fit')));
    await storeLevel(levels, levelJson('hexa-sort'));

    const result = await new GetLevelsUseCase(levels, logger).execute();

    if (!result.ok) {
      throw new Error('GetLevels has no expected failure.');
    }
    expect(result.value.levels.map((level) => receiveJsonOf(level))).toEqual([
      levelJson('hexa-sort'),
    ]);
    expect(result.value.unavailable).toEqual([
      { gameId: 'hexa-fit', levelId: 'fit-01', reason: 'invalid-figure' },
    ]);
    expect(logger.entries).toEqual([
      {
        useCase: 'GetLevels',
        outcome: 'unavailable-level',
        gameId: 'hexa-fit',
        levelId: 'fit-01',
        reason: 'invalid-figure',
      },
    ]);
  });

  // A log write that fails does not change the read, as in LoggingAspect.
  it('should_give_the_levels_when_the_logger_throws', async () => {
    levels.storeRow(brokenRow(levelJson('hexa-fit')));
    const failing: Logger = {
      log: () => {
        throw new Error('the log is full');
      },
    };

    const result = await new GetLevelsUseCase(levels, failing).execute();

    expect(result).toEqual({
      ok: true,
      value: {
        levels: [],
        unavailable: [{ gameId: 'hexa-fit', levelId: 'fit-01', reason: 'invalid-figure' }],
      },
    });
  });
});
