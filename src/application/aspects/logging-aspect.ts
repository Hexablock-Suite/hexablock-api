import type { Result } from '../../domain/shared/result.js';
import type { Logger, UseCaseLogEntry } from '../ports/logger.js';
import { describeThrown } from '../thrown-value.js';
import type { UseCase } from '../use-case.js';
import { UseCaseAspect } from './use-case-aspect.js';

// Removes the useCase field from each member of a union of entries.
type WithoutUseCase<TEntry> = TEntry extends unknown ? Omit<TEntry, 'useCase'> : never;

// An extra entry of a successful call. It has no useCase: the aspect adds its
// own name.
export type ExtraLogEntry = WithoutUseCase<UseCaseLogEntry>;

// Gives the extra entries of a successful call from the value of its Result.
// The composition root gives one to the aspect (#219).
export type ExtraLogEntries<TValue> = (value: TValue) => readonly ExtraLogEntry[];

// Logs each call of the inner use case: its name and the outcome. It writes
// a typed entry to the Logger port, and the adapter writes the text
// (decision 10 of docs/architecture/classes.md, Q12). A failed Result logs
// only its kind, so a value that the client sent never reaches the log. A
// thrown error logs its name, its string code and its stack frames, never
// its message, and the aspect throws it again. A logger that throws does not
// change the outcome of the use case. An optional function gives extra
// entries from the value of a success, such as one entry for each broken
// level row of GetLevels (#219). The aspect writes them before the success
// entry, with its own name.
export class LoggingAspect<
  TRequest,
  TValue,
  TError extends { readonly kind: string },
> extends UseCaseAspect<TRequest, Result<TValue, TError>> {
  constructor(
    inner: UseCase<TRequest, Result<TValue, TError>>,
    private readonly name: string,
    private readonly logger: Logger,
    private readonly extraEntries: ExtraLogEntries<TValue> = () => [],
  ) {
    super(inner);
  }

  override async execute(request: TRequest): Promise<Result<TValue, TError>> {
    let result: Result<TValue, TError>;
    try {
      result = await super.execute(request);
    } catch (error) {
      // A getter of the thrown value can throw while the aspect reads it.
      // So the aspect builds the entry inside safely(), and the caller still
      // gets the thrown value.
      this.safely(() =>
        this.logger.log({ useCase: this.name, outcome: 'error', ...describeThrown(error) }),
      );
      throw error;
    }
    if (result.ok) {
      this.logExtraEntries(result.value);
      this.safely(() => this.logger.log({ useCase: this.name, outcome: 'success' }));
    } else {
      this.safely(() =>
        this.logger.log({ useCase: this.name, outcome: 'failure', kind: result.error.kind }),
      );
    }
    return result;
  }

  // Writes each extra entry of a success. Each write runs inside safely(), so
  // a failed write stops only that entry. The function also runs inside
  // safely(), so a function that throws stops only the extra entries.
  private logExtraEntries(value: TValue): void {
    this.safely(() => {
      for (const entry of this.extraEntries(value)) {
        this.safely(() => this.logger.log({ useCase: this.name, ...entry }));
      }
    });
  }

  // Runs one log write. A failure of the write stops here: the caller gets
  // the result or the error of the inner use case.
  private safely(write: () => void): void {
    try {
      write();
    } catch {
      // No source gives a policy for a failed log write, so the aspect drops it.
    }
  }
}
