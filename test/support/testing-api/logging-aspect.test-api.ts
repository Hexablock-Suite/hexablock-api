import type { LoggerService } from '@nestjs/common';
import { NestLogger } from '../../../src/adapters/logging/nest-logger.js';
import {
  type ExtraLogEntries,
  LoggingAspect,
} from '../../../src/application/aspects/logging-aspect.js';
import type { Logger, UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import type { UseCase } from '../../../src/application/use-case.js';
import { err, ok, type Result } from '../../../src/domain/shared/result.js';
import { FakeStopwatch } from '../fake-stopwatch.js';
import { RecordingLogger } from './recording-logger.js';
import { WhenOutcome } from './when-outcome.js';

// A failure of the inner use case. It carries a kind, and it can carry any
// other value, such as a value that the client sent.
export interface EchoProblem {
  readonly kind: string;
  readonly [part: string]: unknown;
}

// The answer of the inner use case as a test names it: a value or a failure.
export type EchoAnswer = { readonly value: string } | { readonly problem: EchoProblem };

type EchoResult = Result<string, EchoProblem>;

// The lines that NestLogger wrote through each method of the Nest logger.
interface NestLines {
  readonly log: unknown[][];
  readonly warn: unknown[][];
  readonly error: unknown[][];
}

// Testing API of LoggingAspect (§3.5, decision 10 of
// docs/architecture/classes.md). It builds the aspect over Echo, a stand-in
// use case, with its test doubles, and the doubles stay private: a test
// names no double. Echo keeps each request and answers with the answer of
// the given step: a value, a failure or a thrown value. The Stopwatch moves
// only inside a call of Echo, by the time of the given step. The Logger
// keeps each write that it tried, and the entries that it wrote. A then
// step fails when no when step ran.
export class LoggingAspectTestApi {
  private readonly stopwatch = new FakeStopwatch();
  private readonly written = new RecordingLogger();
  private readonly tried: UseCaseLogEntry[] = [];
  private failingWrites: 'none' | 'first' | 'every' = 'none';
  private readonly recordingLogger: Logger = {
    log: (entry) => {
      this.tried.push(entry);
      if (
        this.failingWrites === 'every' ||
        (this.failingWrites === 'first' && this.tried.length === 1)
      ) {
        throw new Error('log sink is full');
      }
      this.written.log(entry);
    },
  };
  private logger: Logger = this.recordingLogger;
  private readonly nestLines: NestLines = { log: [], warn: [], error: [] };
  private answer: () => Promise<EchoResult> = () => Promise.resolve(ok('done'));
  private innerResult: EchoResult | undefined;
  private thrown: unknown;
  private durations: number[] = [];
  private readonly requests: string[] = [];
  private extraEntries: ExtraLogEntries<string> | undefined;
  private readonly askedValues: string[] = [];
  private aspect: UseCase<string, EchoResult> | undefined;
  private readonly outcome = new WhenOutcome<EchoResult>();

  givenTheInnerUseCaseAnswers(answer: EchoAnswer): this {
    const result: EchoResult = 'value' in answer ? ok(answer.value) : err(answer.problem);
    this.innerResult = result;
    this.answer = () => Promise.resolve(result);
    return this;
  }

  givenTheInnerUseCaseSucceedsWith(value: string): this {
    return this.givenTheInnerUseCaseAnswers({ value });
  }

  givenTheInnerUseCaseFailsWith(problem: EchoProblem): this {
    return this.givenTheInnerUseCaseAnswers({ problem });
  }

  // Each call of Echo rejects with this value.
  givenTheInnerUseCaseThrows(thrown: unknown): this {
    this.thrown = thrown;
    this.answer = () => Promise.reject(thrown);
    return this;
  }

  // Each call of Echo takes the next duration of the list, in milliseconds.
  givenTheInnerCallsTake(durations: readonly number[]): this {
    this.durations = [...durations];
    return this;
  }

  // The function of extra entries gives one unavailable-level entry of
  // hexa-fit for each levelId of the value, split on commas.
  givenAnUnavailableLevelEntryForEachLevelIdOfTheValue(): this {
    this.extraEntries = (value) => {
      this.askedValues.push(value);
      return value.split(',').map((levelId) => ({
        outcome: 'unavailable-level' as const,
        gameId: 'hexa-fit',
        levelId,
        reason: 'invalid-figure',
      }));
    };
    return this;
  }

  givenTheExtraEntriesFunctionThrows(): this {
    this.extraEntries = () => {
      throw new Error('no entries');
    };
    return this;
  }

  givenTheLoggerThrowsOnTheFirstWrite(): this {
    this.failingWrites = 'first';
    return this;
  }

  givenTheLoggerThrowsOnEveryWrite(): this {
    this.failingWrites = 'every';
    return this;
  }

  // The aspect writes to NestLogger over a Nest logger that keeps each line.
  givenTheAspectWritesThroughNestLogger(): this {
    const keep =
      (lines: unknown[][]) =>
      (...line: unknown[]): void => {
        lines.push(line);
      };
    const nest: LoggerService = {
      log: keep(this.nestLines.log),
      warn: keep(this.nestLines.warn),
      error: keep(this.nestLines.error),
    };
    this.logger = new NestLogger(nest);
    return this;
  }

  // Calls the aspect, named Echo, with the request. The aspect is built once,
  // before the first call.
  async whenCallingTheAspectWith(request: string): Promise<this> {
    const aspect = (this.aspect ??= this.built());
    await this.outcome.record(() => aspect.execute(request));
    return this;
  }

  // The aspect gives the very result of Echo.
  thenTheAspectGivesTheInnerResultUnchanged(): void {
    expect(this.outcome.value()).toBe(this.innerResult);
  }

  // The caller gets the very value that Echo threw.
  thenTheAspectRethrowsTheThrownValue(): void {
    expect(this.outcome.rejection()).toBe(this.thrown);
  }

  thenTheInnerUseCaseGot(requests: readonly string[]): void {
    this.outcome.ran();
    expect(this.requests).toEqual(requests);
  }

  // The entries that the Logger wrote, in order.
  thenTheLogEntriesAre(entries: readonly UseCaseLogEntry[]): void {
    this.outcome.ran();
    expect(this.written.entries).toEqual(entries);
  }

  // Each write that the aspect tried, in order, the failed ones included.
  thenTheTriedWritesAre(entries: readonly UseCaseLogEntry[]): void {
    this.outcome.ran();
    expect(this.tried).toEqual(entries);
  }

  thenOneWriteWasTried(): void {
    this.outcome.ran();
    expect(this.tried).toHaveLength(1);
  }

  thenNoWriteWasTried(): void {
    this.outcome.ran();
    expect(this.tried).toEqual([]);
  }

  // The first entry, an extra entry, has no duration.
  thenTheFirstEntryHasNoDuration(): void {
    this.outcome.ran();
    expect(this.written.entries[0]).not.toHaveProperty('elapsedMs');
  }

  thenTheFramesOfTheErrorEntryStartWithAStackLine(): void {
    this.outcome.ran();
    const [entry] = this.written.entries;
    expect(entry?.outcome === 'error' && entry.frames).toMatch(/^ {4}at /);
  }

  thenNoExtraEntryWasAsked(): void {
    this.outcome.ran();
    expect(this.askedValues).toEqual([]);
  }

  // No write that the aspect tried holds the text.
  thenNoLogEntryHolds(text: string): void {
    this.outcome.ran();
    expect(JSON.stringify(this.tried)).not.toContain(text);
  }

  thenTheNestLoggerWroteOnlyOneErrorLine(): void {
    this.outcome.ran();
    expect(this.nestLines.error).toHaveLength(1);
    expect(this.nestLines.log).toEqual([]);
    expect(this.nestLines.warn).toEqual([]);
  }

  thenNoNestLineHolds(text: string): void {
    this.outcome.ran();
    expect(
      JSON.stringify([this.nestLines.log, this.nestLines.warn, this.nestLines.error]),
    ).not.toContain(text);
  }

  private built(): UseCase<string, EchoResult> {
    const echo: UseCase<string, EchoResult> = {
      execute: (request) => {
        this.requests.push(request);
        this.stopwatch.advanceBy(this.durations.shift() ?? 0);
        return this.answer();
      },
    };
    return new LoggingAspect(echo, 'Echo', this.logger, this.stopwatch, this.extraEntries);
  }
}
