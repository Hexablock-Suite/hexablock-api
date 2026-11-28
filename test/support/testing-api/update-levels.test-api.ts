import { AuthorizationAspect } from '../../../src/application/aspects/authorization-aspect.js';
import { LoggingAspect } from '../../../src/application/aspects/logging-aspect.js';
import type { InvalidLevels } from '../../../src/application/levels/invalid-levels.js';
import type { UnavailableLevel } from '../../../src/application/levels/listed-levels.js';
import {
  type UpdateLevels,
  type UpdateLevelsError,
  type UpdateLevelsRequest,
  UpdateLevelsUseCase,
} from '../../../src/application/levels/update-levels.use-case.js';
import type { LevelUpdater } from '../../../src/application/ports/level-repository.js';
import type { UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import type { LevelProblem } from '../../../src/domain/level/level-problem.js';
import { LevelId } from '../../../src/domain/shared/level-id.js';
import type { Result } from '../../../src/domain/shared/result.js';
import type { LevelEditors } from '../../../src/domain/user/level-editors.js';
import { FakeStopwatch } from '../fake-stopwatch.js';
import { InMemoryLevelRepository } from '../in-memory-level-repository.js';
import { type LevelJson, levelValidators } from '../level-format.js';
import { brokenRow, listedJson, storeLevel } from '../level-repository.contract.js';
import { incomingLevel } from '../level-update.js';
import { ProgressMother } from '../object-mother/progress-mother.js';
import { UserMother } from '../object-mother/user-mother.js';
import { valueOf } from '../result.js';
import { testUserId } from '../user-ids.js';
import { Arrangements } from './arrangements.js';
import { RecordingLogger } from './recording-logger.js';
import { WhenOutcome } from './when-outcome.js';

// One problem of a level as a test names it: the gameId, the levelId and
// the code of the rule that the level breaks.
export type LevelProblemRow = readonly [gameId: string, levelId: string, problem: LevelProblem];

// The failure invalid-levels with one problem per row, as the use case
// reports it.
export function invalidLevelsOf(rows: readonly LevelProblemRow[]): InvalidLevels {
  return {
    kind: 'invalid-levels',
    problems: rows.map(([gameId, levelId, problem]) => ({
      gameId: ProgressMother.gameId(gameId),
      levelId: valueOf(LevelId.of(levelId)),
      problem,
    })),
  };
}

type UpdateAnswer = Result<void, UpdateLevelsError>;

// Testing API of UpdateLevelsUseCase (API-FR-04), alone or inside the
// aspects as AppModule wires it: LoggingAspect over AuthorizationAspect
// (#180). It builds the use case and its test doubles, and the doubles stay
// private: a test names no double. The use case holds only the LevelUpdater
// role of the level store (#193). Every update is of user 1 unless a when
// step names the user. A then step reads the answer of the last when step
// and the levels that the store held after it. A then step fails when no
// when step ran.
export class UpdateLevelsTestApi {
  private readonly levels = new InMemoryLevelRepository(levelValidators());
  private readonly save = vi.spyOn(this.levels, 'update');
  private updater: LevelUpdater = this.levels;
  private readonly saveFailure = new Error('the connection is lost');
  private editors: LevelEditors = UserMother.levelEditors([1]);
  private readonly logger = new RecordingLogger();
  private readonly arrangements = new Arrangements();
  private readonly outcome = new WhenOutcome<UpdateAnswer>();
  private storedJson: unknown[] = [];
  private unavailable: readonly UnavailableLevel[] = [];

  // Stores each level through the update of the level store, in order.
  givenTheStoredLevels(levels: readonly LevelJson[]): this {
    for (const json of levels) {
      this.arrangements.add(() => storeLevel(this.levels, json));
    }
    return this;
  }

  // Stores the row of the level with a section that breaks a rule (#147),
  // with the given version.
  givenABrokenRowOf(json: LevelJson, version = json.version): this {
    this.arrangements.add(() => this.levels.storeRow(brokenRow(json, version)));
    return this;
  }

  // Stores the row of the level with a broken section and a version that
  // breaks the rule of LevelVersion.
  givenABrokenRowWithABrokenVersionOf(json: LevelJson): this {
    this.arrangements.add(() => this.levels.storeRow({ ...brokenRow(json), version: 0 }));
    return this;
  }

  // The batch was updated once before the when step.
  givenAnUpdateOf(levels: readonly LevelJson[]): this {
    this.arrangements.add(() => this.useCase().execute(this.requestOf(1, levels)));
    return this;
  }

  // The level store plays only the LevelUpdater role: update() alone. Its
  // second save rejects, once. The other saves reach the level store.
  givenTheSecondSaveFails(): this {
    let saves = 0;
    this.updater = {
      update: (gameId, levelId, change) => {
        saves += 1;
        return saves === 2
          ? Promise.reject(this.saveFailure)
          : this.levels.update(gameId, levelId, change);
      },
    };
    return this;
  }

  // The level store plays only the LevelUpdater role: update() alone.
  // Before each save, another update saves these levels and ends.
  givenANewerUpdateSavesBeforeEachSave(levels: readonly LevelJson[]): this {
    const newer = new UpdateLevelsUseCase(this.levels, levelValidators());
    this.updater = {
      update: async (gameId, levelId, change) => {
        await newer.execute(this.requestOf(1, levels));
        return this.levels.update(gameId, levelId, change);
      },
    };
    return this;
  }

  givenTheLevelEditors(users: readonly number[]): this {
    this.editors = UserMother.levelEditors(users);
    return this;
  }

  // User 1 sends the batch, in the order of the body.
  async whenUpdating(levels: readonly LevelJson[]): Promise<this> {
    return this.when(this.useCase(), 1, levels);
  }

  // UpdateLevels binds UseCase, so LoggingAspect wraps it under its own name
  // (decisions 7 and 10).
  async whenUpdatingThroughTheLoggingAspect(levels: readonly LevelJson[]): Promise<this> {
    return this.when(this.logged(this.useCase()), 1, levels);
  }

  // User n sends the batch through LoggingAspect over AuthorizationAspect,
  // as AppModule wires it (#180).
  async whenUserUpdatesThroughTheAspects(
    user: number,
    levels: readonly LevelJson[],
  ): Promise<this> {
    return this.when(
      this.logged(new AuthorizationAspect(this.useCase(), this.editors)),
      user,
      levels,
    );
  }

  thenTheUpdateSucceeds(): void {
    expect(this.outcome.value()).toEqual({ ok: true, value: undefined });
  }

  thenTheUpdateFailsWith(rows: readonly LevelProblemRow[]): void {
    expect(this.outcome.value()).toEqual({ ok: false, error: invalidLevelsOf(rows) });
  }

  thenTheUpdateFailsWithTheKind(kind: UpdateLevelsError['kind']): void {
    const answer = this.outcome.value();
    expect(answer.ok || answer.error.kind).toBe(kind);
  }

  thenTheUpdateFailsWithNotALevelEditor(): void {
    expect(this.outcome.value()).toEqual({ ok: false, error: { kind: 'not-a-level-editor' } });
  }

  // A save that throws reaches the caller as it is.
  thenTheUpdateRejectsWithTheSaveFailure(): void {
    expect(this.outcome.rejection()).toBe(this.saveFailure);
  }

  // The valid levels of the store, as JSON, in the order of the read.
  thenTheStoredLevelsAre(levels: readonly LevelJson[]): void {
    this.outcome.ran();
    expect(this.storedJson).toEqual(levels);
  }

  // The rows of the store that break a rule, after the when step.
  thenTheUnavailableLevelsAre(unavailable: readonly UnavailableLevel[]): void {
    this.outcome.ran();
    expect({ unavailable: this.unavailable }).toMatchObject({ unavailable });
  }

  thenNoLevelWasSaved(): void {
    this.outcome.ran();
    expect(this.save).not.toHaveBeenCalled();
  }

  thenTheLogEntriesAre(entries: readonly UseCaseLogEntry[]): void {
    this.outcome.ran();
    expect(this.logger.entries).toEqual(entries);
  }

  thenNoLogEntryHolds(text: string): void {
    this.outcome.ran();
    expect(JSON.stringify(this.logger.entries)).not.toContain(text);
  }

  thenNoLogEntryHoldsTheIdOfUser(n: number): void {
    this.thenNoLogEntryHolds(testUserId(n));
  }

  // Runs the given steps, then sends the request. The calls of the level
  // store start again after the given steps. It keeps the levels that the
  // store holds after the call.
  private async when(
    update: UpdateLevels,
    user: number,
    levels: readonly LevelJson[],
  ): Promise<this> {
    await this.arrangements.run();
    this.save.mockClear();
    await this.outcome.record(() => update.execute(this.requestOf(user, levels)));
    this.storedJson = await listedJson(this.levels);
    this.unavailable = (await this.levels.list()).unavailable;
    return this;
  }

  // The use case holds no state, so each when step gets a new one with the
  // doubles of the scenario.
  private useCase(): UpdateLevels {
    return new UpdateLevelsUseCase(this.updater, levelValidators());
  }

  private logged(update: UpdateLevels): UpdateLevels {
    return new LoggingAspect(update, 'UpdateLevels', this.logger, new FakeStopwatch());
  }

  // Builds the request as LevelDtoMapper does: the UserId of the account and
  // the levels as domain values.
  private requestOf(user: number, levels: readonly LevelJson[]): UpdateLevelsRequest {
    return { userId: UserMother.id(user), levels: levels.map((json) => incomingLevel(json)) };
  }
}
