import { receiveJsonOf } from '../../../src/adapters/received.js';
import { LoggingAspect } from '../../../src/application/aspects/logging-aspect.js';
import {
  type GetLevels,
  GetLevelsUseCase,
} from '../../../src/application/levels/get-levels.use-case.js';
import type {
  ListedLevels,
  UnavailableLevel,
} from '../../../src/application/levels/listed-levels.js';
import { unavailableLevelEntries } from '../../../src/application/levels/unavailable-level-entries.js';
import type { LevelLister } from '../../../src/application/ports/level-repository.js';
import type { Logger, UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import type { Result } from '../../../src/domain/shared/result.js';
import type { Mock } from 'vitest';
import { FakeStopwatch } from '../fake-stopwatch.js';
import { InMemoryLevelRepository } from '../in-memory-level-repository.js';
import { type LevelJson, levelValidators } from '../level-format.js';
import { brokenRow, storeLevel } from '../level-repository.contract.js';
import { Arrangements } from './arrangements.js';
import { RecordingLogger, failingLogger } from './recording-logger.js';
import { WhenOutcome } from './when-outcome.js';

// Testing API of GetLevelsUseCase (API-FR-04), alone or inside LoggingAspect
// as AppModule wires it (#219). It builds the use case, the aspect and their
// test doubles, and the doubles stay private: a test names no double. The
// use case holds only the LevelLister role of the level store (#193). A then
// step fails when no when step ran.
export class GetLevelsTestApi {
  private readonly levels = new InMemoryLevelRepository(levelValidators());
  private lister: LevelLister = this.levels;
  private listerOnly: { list: Mock<LevelLister['list']> } | undefined;
  private readonly recordingLogger = new RecordingLogger();
  private logger: Logger = this.recordingLogger;
  private readonly arrangements = new Arrangements();
  private readonly outcome = new WhenOutcome<Result<ListedLevels, never>>();

  // Stores each level through the update of the level store, in order.
  givenTheStoredLevels(levels: readonly LevelJson[]): this {
    for (const json of levels) {
      this.arrangements.add(() => storeLevel(this.levels, json));
    }
    return this;
  }

  // Stores the row of the level with a section that breaks a rule (#147).
  givenABrokenRowOf(json: LevelJson): this {
    this.arrangements.add(() => this.levels.storeRow(brokenRow(json)));
    return this;
  }

  // The level store plays only the LevelLister role: list() alone, which
  // gives these levels.
  givenALevelListerThatGives(listed: ListedLevels): this {
    const lister = { list: vi.fn<LevelLister['list']>(() => Promise.resolve(listed)) };
    this.listerOnly = lister;
    this.lister = lister;
    return this;
  }

  givenTheLoggerThrows(): this {
    this.logger = failingLogger;
    return this;
  }

  async whenGettingTheLevels(): Promise<this> {
    return this.when(new GetLevelsUseCase(this.lister));
  }

  // GetLevels runs inside LoggingAspect, with unavailableLevelEntries(), as
  // AppModule wires it.
  async whenGettingTheLevelsThroughTheLoggingAspect(): Promise<this> {
    const getLevels: GetLevels = new GetLevelsUseCase(this.lister);
    return this.when(
      new LoggingAspect(
        getLevels,
        'GetLevels',
        this.logger,
        new FakeStopwatch(),
        unavailableLevelEntries,
      ),
    );
  }

  // The read gives exactly this answer.
  thenTheReadGives(listed: ListedLevels): void {
    expect(this.outcome.value()).toEqual({ ok: true, value: listed });
  }

  // The valid levels, as JSON, in the order of the read.
  thenTheLevelsAre(levels: readonly LevelJson[]): void {
    expect(this.listed().levels.map((level) => receiveJsonOf(level))).toEqual(levels);
  }

  thenTheUnavailableLevelsAre(unavailable: readonly UnavailableLevel[]): void {
    expect(this.listed().unavailable).toEqual(unavailable);
  }

  thenTheListerWasAskedOnce(): void {
    this.outcome.ran();
    expect(this.listerOnly?.list).toHaveBeenCalledExactlyOnceWith();
  }

  thenTheLogEntriesAre(entries: readonly UseCaseLogEntry[]): void {
    this.outcome.ran();
    expect(this.recordingLogger.entries).toEqual(entries);
  }

  private async when(getLevels: GetLevels): Promise<this> {
    await this.arrangements.run();
    await this.outcome.record(() => getLevels.execute());
    return this;
  }

  private listed(): ListedLevels {
    const result = this.outcome.value();
    if (!result.ok) {
      throw new Error('GetLevels has no expected failure.');
    }
    return result.value;
  }
}
