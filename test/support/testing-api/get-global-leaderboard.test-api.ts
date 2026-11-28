import { receiveValueOf } from '../../../src/adapters/received.js';
import { LoggingAspect } from '../../../src/application/aspects/logging-aspect.js';
import {
  type GetGlobalLeaderboard,
  GetGlobalLeaderboardUseCase,
  type GlobalLeaderboard,
} from '../../../src/application/leaderboard/get-global-leaderboard.use-case.js';
import type { GlobalBoardReader } from '../../../src/application/ports/global-board-reader.js';
import type { UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import type { GameId } from '../../../src/domain/shared/game-id.js';
import type { RankedBoard } from '../../../src/domain/progress/ranked-board.js';
import type { Standing } from '../../../src/domain/progress/standing.js';
import type { Result } from '../../../src/domain/shared/result.js';
import { FakeStopwatch } from '../fake-stopwatch.js';
import {
  BoardMother,
  type Ranked,
  type ScoreRow,
  type StandingRow,
  type StandingTotals,
} from '../object-mother/board-mother.js';
import { ProgressMother } from '../object-mother/progress-mother.js';
import { testUserId } from '../user-ids.js';
import { RecordingLogger } from './recording-logger.js';
import { WhenOutcome } from './when-outcome.js';

// The rows of the two global boards of a game as a test names them.
export interface GlobalRows {
  readonly highScores?: readonly ScoreRow[];
  readonly standings?: readonly StandingRow[];
}

// The rows of the two ranked global boards of a game as a test states them,
// each with the rank that the test expects, in board order.
export interface RankedGlobalRows {
  readonly highScores?: readonly Ranked<ScoreRow>[];
  readonly standings?: readonly Ranked<StandingRow>[];
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

  // Both boards of the game of the query hold these rows, in this order and
  // with these ranks. The test states each row, so a wrong order fails.
  thenTheBoardsAre(rows: RankedGlobalRows): void {
    const answer = this.outcome.value();
    expect(
      answer.ok
        ? {
            gameId: answer.value.gameId,
            highScores: rowsOf(answer.value.highScores, (score) => ({
              score: receiveValueOf(score),
            })),
            standings: rowsOf(answer.value.standings, standingTotalsOf),
          }
        : answer,
    ).toEqual({
      gameId: this.gameId,
      highScores: (rows.highScores ?? []).map(({ rank, player, score }) => ({
        rank,
        ...playerOf(player),
        score,
      })),
      standings: (rows.standings ?? []).map((row) => ({
        rank: row.rank,
        ...playerOf(row.player),
        ...BoardMother.standingTotals(row),
      })),
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

// The four totals that one delivery of a standing gives.
function standingTotalsOf(standing: Standing): StandingTotals {
  const received: StandingTotals[] = [];
  standing.deliverTo({
    receive(stars, levels, moves, elapsedTime) {
      received.push({
        stars: receiveValueOf(stars),
        levels: receiveValueOf(levels),
        moves: receiveValueOf(moves),
        elapsedMs: receiveValueOf(elapsedTime),
      });
    },
  });
  if (received.length !== 1) throw new Error(`The standing delivered ${received.length} times.`);
  return received[0];
}
