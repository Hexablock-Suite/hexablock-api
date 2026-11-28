import { LoggingAspect } from '../../../src/application/aspects/logging-aspect.js';
import {
  type GetGlobalLeaderboard,
  GetGlobalLeaderboardUseCase,
  type GlobalLeaderboard,
} from '../../../src/application/leaderboard/get-global-leaderboard.use-case.js';
import type { GlobalBoardReader } from '../../../src/application/ports/global-board-reader.js';
import type { UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import type { GameId } from '../../../src/domain/progress/game-id.js';
import { RankedBoard } from '../../../src/domain/progress/ranked-board.js';
import type { Result } from '../../../src/domain/shared/result.js';
import { FakeStopwatch } from '../fake-stopwatch.js';
import { BoardMother, type ScoreRow, type StandingRow } from '../object-mother/board-mother.js';
import { ProgressMother } from '../object-mother/progress-mother.js';
import { RecordingLogger } from './recording-logger.js';
import { WhenOutcome } from './when-outcome.js';

// The rows of the two global boards of a game as a test names them.
export interface GlobalRows {
  readonly highScores?: readonly ScoreRow[];
  readonly standings?: readonly StandingRow[];
}

// Testing API of GetGlobalLeaderboardUseCase (API-FR-03), alone or inside
// LoggingAspect as AppModule wires it. It builds the use case and its test
// doubles, and the doubles stay private: a test names no double. A then step
// fails when no when step ran.
export class GetGlobalLeaderboardTestApi {
  // It gives the rows in the order of the test, as the port gives them in
  // no order, and records each call. It has no levelResults(): the global
  // board does not depend on the board of a level (#218).
  private readonly reader = {
    highScores: vi.fn<GlobalBoardReader['highScores']>(() => Promise.resolve([])),
    standings: vi.fn<GlobalBoardReader['standings']>(() => Promise.resolve([])),
  } satisfies GlobalBoardReader;
  private readonly logger = new RecordingLogger();
  private readonly outcome = new WhenOutcome<Result<GlobalLeaderboard, never>>();
  private gameId: GameId | undefined;

  givenTheReaderGives(rows: GlobalRows): this {
    const highScores = (rows.highScores ?? []).map((row) => BoardMother.scoreEntry(row));
    const standings = (rows.standings ?? []).map((row) => BoardMother.standingEntry(row));
    this.reader.highScores.mockImplementation(() => Promise.resolve(highScores));
    this.reader.standings.mockImplementation(() => Promise.resolve(standings));
    return this;
  }

  async whenReadingTheBoardsOf(gameId: string): Promise<this> {
    return this.when(gameId, new GetGlobalLeaderboardUseCase(this.reader));
  }

  // GetGlobalLeaderboard binds UseCase, so LoggingAspect wraps it under its
  // own name (decisions 7 and 10).
  async whenReadingTheBoardsThroughTheLoggingAspect(gameId: string): Promise<this> {
    const inner: GetGlobalLeaderboard = new GetGlobalLeaderboardUseCase(this.reader);
    return this.when(
      gameId,
      new LoggingAspect(inner, 'GetGlobalLeaderboard', this.logger, new FakeStopwatch()),
    );
  }

  // Both boards of the game of the query hold these rows, ranked by the domain.
  thenTheBoardsAre(rows: GlobalRows): void {
    expect(this.outcome.value()).toEqual({
      ok: true,
      value: {
        gameId: this.gameId,
        highScores: RankedBoard.of(
          (rows.highScores ?? []).map((row) => BoardMother.scoreEntry(row)),
        ),
        standings: RankedBoard.of(
          (rows.standings ?? []).map((row) => BoardMother.standingEntry(row)),
        ),
      },
    });
  }

  thenTheReaderWasAskedOnceForEachBoardOfTheGame(): void {
    this.outcome.ran();
    expect(this.reader.highScores).toHaveBeenCalledExactlyOnceWith(this.gameId);
    expect(this.reader.standings).toHaveBeenCalledExactlyOnceWith(this.gameId);
  }

  thenTheLogEntriesAre(entries: readonly UseCaseLogEntry[]): void {
    this.outcome.ran();
    expect(this.logger.entries).toEqual(entries);
  }

  private async when(gameId: string, useCase: GetGlobalLeaderboard): Promise<this> {
    const game = ProgressMother.gameId(gameId);
    this.gameId = game;
    await this.outcome.record(() => useCase.execute(game));
    return this;
  }
}
