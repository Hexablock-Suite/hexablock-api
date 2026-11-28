import { receiveLevelResultOf, receiveValueOf } from '../../../src/adapters/received.js';
import { LoggingAspect } from '../../../src/application/aspects/logging-aspect.js';
import {
  type GetLevelLeaderboard,
  GetLevelLeaderboardUseCase,
  type LevelBoardQuery,
  type LevelLeaderboard,
  type UnknownLevel,
} from '../../../src/application/leaderboard/get-level-leaderboard.use-case.js';
import type { LevelBoardReader } from '../../../src/application/ports/level-board-reader.js';
import type { LevelHolder } from '../../../src/application/ports/level-repository.js';
import type { UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import { GameId } from '../../../src/domain/shared/game-id.js';
import { LevelId } from '../../../src/domain/shared/level-id.js';
import type { RankedBoard } from '../../../src/domain/progress/ranked-board.js';
import type { Result } from '../../../src/domain/shared/result.js';
import type { Mock } from 'vitest';
import { FakeStopwatch } from '../fake-stopwatch.js';
import { InMemoryLevelRepository } from '../in-memory-level-repository.js';
import { levelJson, levelValidators } from '../level-format.js';
import { storeLevel } from '../level-repository.contract.js';
import { BoardMother, type LevelRow, type Ranked } from '../object-mother/board-mother.js';
import { valueOf } from '../result.js';
import { testUserId } from '../user-ids.js';
import { RecordingLogger } from './recording-logger.js';
import { WhenOutcome } from './when-outcome.js';

// Testing API of GetLevelLeaderboardUseCase (API-FR-03), alone or inside
// LoggingAspect as AppModule wires it. It builds the use case and its test
// doubles, and the doubles stay private: a test names no double. The use
// case holds the LevelBoardReader port and only the LevelHolder role of the
// level store (#193). By default the level store holds fit-01 of hexa-fit.
// A then step fails when no when step ran.
export class GetLevelLeaderboardTestApi {
  // It gives the rows in the order of the test, as the port gives them in
  // no order, and records each call. It has no highScores() and no
  // standings(): the board of a level does not depend on the global boards
  // (#218).
  private readonly reader = {
    levelResults: vi.fn<LevelBoardReader['levelResults']>(() => Promise.resolve([])),
  } satisfies LevelBoardReader;
  private levels: LevelHolder | undefined;
  private holderOnly: { holds: Mock<LevelHolder['holds']> } | undefined;
  private readonly logger = new RecordingLogger();
  private readonly outcome = new WhenOutcome<Result<LevelLeaderboard, UnknownLevel>>();
  private query: LevelBoardQuery | undefined;

  givenTheReaderGives(rows: readonly LevelRow[]): this {
    const entries = rows.map((row) => BoardMother.levelEntry(row));
    this.reader.levelResults.mockImplementation(() => Promise.resolve(entries));
    return this;
  }

  // The level store holds fit-01 of hexa-fit as a row that breaks a rule.
  givenTheLevelIsStoredAsABrokenRow(): this {
    const levels = new InMemoryLevelRepository(levelValidators());
    levels.storeRow({ ...levelJson('hexa-fit', 'fit-01'), section: { figure: [] } });
    this.levels = levels;
    return this;
  }

  // The level store plays only the LevelHolder role: holds() alone, which
  // holds every level.
  givenALevelHolderThatHoldsEveryLevel(): this {
    const holder = { holds: vi.fn<LevelHolder['holds']>(() => Promise.resolve(true)) };
    this.holderOnly = holder;
    this.levels = holder;
    return this;
  }

  async whenReadingTheBoardOf(gameId: string, levelId: string): Promise<this> {
    return this.when(gameId, levelId, (useCase) => useCase);
  }

  // GetLevelLeaderboard binds UseCase, so LoggingAspect wraps it under its
  // own name (decisions 7 and 10).
  async whenReadingTheBoardThroughTheLoggingAspect(gameId: string, levelId: string): Promise<this> {
    return this.when(
      gameId,
      levelId,
      (useCase) =>
        new LoggingAspect(useCase, 'GetLevelLeaderboard', this.logger, new FakeStopwatch()),
    );
  }

  // The board of the level of the query holds these rows, in this order and
  // with these ranks. The test states each row, so a wrong order fails.
  thenTheBoardIs(rows: readonly Ranked<LevelRow>[]): void {
    const answer = this.outcome.value();
    expect(
      answer.ok
        ? {
            gameId: answer.value.gameId,
            levelId: answer.value.levelId,
            entries: rowsOf(answer.value.entries, (result) => receiveLevelResultOf(result)),
          }
        : answer,
    ).toEqual({
      gameId: this.query?.gameId,
      levelId: this.query?.levelId,
      entries: rows.map(({ rank, player, ...values }) => ({
        rank,
        ...playerOf(player),
        levelId: BoardMother.LEVEL_ID,
        ...values,
      })),
    });
  }

  thenTheReadFailsWithUnknownLevel(): void {
    expect(this.outcome.value()).toEqual({ ok: false, error: { kind: 'unknown-level' } });
  }

  thenTheReaderWasAskedOnceForTheLevelOfTheQuery(): void {
    this.outcome.ran();
    expect(this.reader.levelResults).toHaveBeenCalledExactlyOnceWith(
      this.query?.gameId,
      this.query?.levelId,
    );
  }

  thenNoResultWasRead(): void {
    this.outcome.ran();
    expect(this.reader.levelResults).not.toHaveBeenCalled();
  }

  thenTheHolderWasAskedOnceForTheLevelOfTheQuery(): void {
    this.outcome.ran();
    expect(this.holderOnly?.holds).toHaveBeenCalledExactlyOnceWith(
      this.query?.gameId,
      this.query?.levelId,
    );
  }

  thenTheLogEntriesAre(entries: readonly UseCaseLogEntry[]): void {
    this.outcome.ran();
    expect(this.logger.entries).toEqual(entries);
  }

  private async when(
    gameId: string,
    levelId: string,
    wrap: (useCase: GetLevelLeaderboard) => GetLevelLeaderboard,
  ): Promise<this> {
    const levels = this.levels ?? (await storedLevels());
    const useCase = wrap(new GetLevelLeaderboardUseCase(this.reader, levels));
    const query = { gameId: valueOf(GameId.of(gameId)), levelId: valueOf(LevelId.of(levelId)) };
    this.query = query;
    await this.outcome.record(() => useCase.execute(query));
    return this;
  }
}

// The level definitions of the tests: they hold fit-01 of hexa-fit.
async function storedLevels(): Promise<InMemoryLevelRepository> {
  const levels = new InMemoryLevelRepository(levelValidators());
  await storeLevel(levels, levelJson('hexa-fit', 'fit-01'));
  return levels;
}

// Runs one delivery of a ranked board and gives each row as plain values, in
// the order of the delivery. The rank, the userId and the username leave
// through their own deliveries, as the border reads them, and valuesOf gives
// the values of the result. A then step compares these rows with the rows
// that the test states, so the expected board never comes from RankedBoard.
function rowsOf<TResult extends { isBetterThan(other: TResult): boolean }, TValues>(
  board: RankedBoard<TResult>,
  valuesOf: (result: TResult) => TValues,
): ({ rank: number; userId: string; username: string } & TValues)[] {
  const rows: ({ rank: number; userId: string; username: string } & TValues)[] = [];
  board.deliverTo({
    receive(rank, userId, username, result) {
      rows.push({
        rank: receiveValueOf(rank),
        userId: receiveValueOf(userId),
        username: receiveValueOf(username),
        ...valuesOf(result),
      });
    },
  });
  return rows;
}

// The userId and the username of player n, as the board delivers them.
function playerOf(n: number): { userId: string; username: string } {
  return { userId: testUserId(n), username: BoardMother.usernameText(n) };
}
