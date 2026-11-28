import { receiveJsonOf } from '../../../src/adapters/received.js';
import { LoggingAspect } from '../../../src/application/aspects/logging-aspect.js';
import {
  type GetLevels,
  GetLevelsUseCase,
} from '../../../src/application/levels/get-levels.use-case.js';
import { unavailableLevelEntries } from '../../../src/application/levels/unavailable-level-entries.js';
import type { Logger, UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import { InMemoryLevelRepository } from '../../support/in-memory-level-repository.js';
import { FakeStopwatch } from '../../support/fake-stopwatch.js';
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
// text. #147: it gives each stored row that breaks a rule apart. #219: the
// use case holds no logger. LoggingAspect logs one entry per broken row
// through unavailableLevelEntries().
describe('GetLevelsUseCase (API-FR-04)', () => {
  let levels: InMemoryLevelRepository;

  beforeEach(() => {
    levels = new InMemoryLevelRepository(levelValidators());
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

    const result = await new GetLevelsUseCase(levels).execute();

    if (!result.ok) {
      throw new Error('GetLevels has no expected failure.');
    }
    expect(result.value.levels.map((level) => receiveJsonOf(level))).toEqual([
      stored[2],
      stored[1],
      stored[0],
    ]);
    expect(result.value.unavailable).toEqual([]);
  });

  it('should_give_no_level_when_no_level_is_stored', async () => {
    const result = await new GetLevelsUseCase(levels).execute();

    expect(result).toEqual({ ok: true, value: { levels: [], unavailable: [] } });
  });

  // A broken row does not hide the other levels. The read gives its key and
  // the code of its rule.
  it('should_give_the_valid_levels_and_each_broken_row_when_a_stored_row_breaks_a_rule', async () => {
    levels.storeRow(brokenRow(levelJson('hexa-fit')));
    await storeLevel(levels, levelJson('hexa-sort'));

    const result = await new GetLevelsUseCase(levels).execute();

    if (!result.ok) {
      throw new Error('GetLevels has no expected failure.');
    }
    expect(result.value.levels.map((level) => receiveJsonOf(level))).toEqual([
      levelJson('hexa-sort'),
    ]);
    expect(result.value.unavailable).toEqual([
      { gameId: 'hexa-fit', levelId: 'fit-01', reason: 'invalid-figure' },
    ]);
  });
});

// Wraps GetLevels in LoggingAspect, as AppModule does.
function insideLoggingAspect(levels: InMemoryLevelRepository, logger: Logger) {
  const getLevels: GetLevels = new GetLevelsUseCase(levels);
  return new LoggingAspect(
    getLevels,
    'GetLevels',
    logger,
    new FakeStopwatch(),
    unavailableLevelEntries,
  );
}

// #219: LoggingAspect wraps GetLevels, as AppModule wires it. The aspect
// writes one unavailable-level entry per broken row, and then the success.
describe('GetLevels inside LoggingAspect (#147, #219)', () => {
  let levels: InMemoryLevelRepository;

  beforeEach(() => {
    levels = new InMemoryLevelRepository(levelValidators());
  });

  it('should_log_one_unavailable_level_entry_per_broken_row_and_then_success_when_logging_aspect_wraps_get_levels', async () => {
    levels.storeRow(brokenRow(levelJson('hexa-fit')));
    levels.storeRow(brokenRow(levelJson('hexa-fit', 'fit-02')));
    await storeLevel(levels, levelJson('hexa-sort'));
    const logger = new RecordingLogger();
    const aspect = insideLoggingAspect(levels, logger);

    const result = await aspect.execute();

    if (!result.ok) {
      throw new Error('GetLevels has no expected failure.');
    }
    expect(result.value.unavailable).toEqual([
      { gameId: 'hexa-fit', levelId: 'fit-01', reason: 'invalid-figure' },
      { gameId: 'hexa-fit', levelId: 'fit-02', reason: 'invalid-figure' },
    ]);
    expect(logger.entries).toEqual([
      {
        useCase: 'GetLevels',
        outcome: 'unavailable-level',
        gameId: 'hexa-fit',
        levelId: 'fit-01',
        reason: 'invalid-figure',
      },
      {
        useCase: 'GetLevels',
        outcome: 'unavailable-level',
        gameId: 'hexa-fit',
        levelId: 'fit-02',
        reason: 'invalid-figure',
      },
      { useCase: 'GetLevels', outcome: 'success', elapsedMs: 0 },
    ]);
  });

  it('should_log_only_success_when_logging_aspect_wraps_get_levels_and_no_row_is_broken', async () => {
    await storeLevel(levels, levelJson('hexa-sort'));
    const logger = new RecordingLogger();
    const aspect = insideLoggingAspect(levels, logger);

    await aspect.execute();

    expect(logger.entries).toEqual([{ useCase: 'GetLevels', outcome: 'success', elapsedMs: 0 }]);
  });

  // A log write that fails does not change the read.
  it('should_give_the_levels_when_the_logger_throws_and_logging_aspect_wraps_get_levels', async () => {
    levels.storeRow(brokenRow(levelJson('hexa-fit')));
    const failing: Logger = {
      log: () => {
        throw new Error('the log is full');
      },
    };
    const aspect = insideLoggingAspect(levels, failing);

    const result = await aspect.execute();

    expect(result).toEqual({
      ok: true,
      value: {
        levels: [],
        unavailable: [{ gameId: 'hexa-fit', levelId: 'fit-01', reason: 'invalid-figure' }],
      },
    });
  });
});
