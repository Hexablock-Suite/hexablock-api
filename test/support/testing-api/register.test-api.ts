import { receiveValueOf } from '../../../src/adapters/received.js';
import { LoggingAspect } from '../../../src/application/aspects/logging-aspect.js';
import type { RegisterUserRequest } from '../../../src/application/auth/credentials.js';
import {
  type RegisterProblem,
  type RegisterUser,
  RegisterUseCase,
} from '../../../src/application/auth/register.use-case.js';
import type { UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import type { Result } from '../../../src/domain/shared/result.js';
import { Password } from '../../../src/domain/user/password.js';
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import type { UserId } from '../../../src/domain/user/user-id.js';
import {
  InMemoryUserRepository,
  PrefixPasswordHasher,
  SequenceUserIdGenerator,
} from '../auth/fakes.js';
import { registerRequest } from '../auth/requests.js';
import { FakeStopwatch } from '../fake-stopwatch.js';
import { UserMother } from '../object-mother/user-mother.js';
import { userPartsOf } from '../recording-receiver.js';
import { valueOf } from '../result.js';
import { testUserId } from '../user-ids.js';
import { Arrangements } from './arrangements.js';
import { RecordingLogger } from './recording-logger.js';
import { WhenOutcome } from './when-outcome.js';

// One stored account as a then step names it: the number n of
// testUserId(n), the username and the password of sign-up.
export interface StoredAccount {
  readonly user: number;
  readonly username: string;
  readonly password: string;
}

// Testing API of RegisterUseCase (API-FR-01). It builds the use case and its
// test doubles, and the doubles stay private: a test names no double. The
// given steps sign up the accounts that a scenario needs, the when step
// signs up, alone or inside LoggingAspect as AppModule wires it, and the then
// steps check the answer, the stored accounts, the calls of the ports and the
// log entries. A then step fails when no when step ran.
export class RegisterTestApi {
  private readonly users = new InMemoryUserRepository();
  private readonly hasher = new PrefixPasswordHasher();
  private readonly hash = vi.spyOn(this.hasher, 'hash');
  private readonly taken = vi.spyOn(this.users, 'isUsernameTaken');
  private readonly hasherFailure = new Error('scrypt failed');
  private readonly register: RegisterUser = new RegisterUseCase(
    this.users,
    this.hasher,
    new SequenceUserIdGenerator(),
  );
  private readonly logger = new RecordingLogger();
  private readonly arrangements = new Arrangements();
  private readonly outcome = new WhenOutcome<Result<UserId, RegisterProblem>>();
  private request: RegisterUserRequest | undefined;
  private madeHashes: PromiseSettledResult<PasswordHash>[] = [];

  // The account signs up through the use case, before the when step.
  givenARegisteredUser(username: string, password: string): this {
    this.arrangements.add(() => this.register.execute(registerRequest(username, password)));
    return this;
  }

  givenTheHasherFails(): this {
    this.hash.mockRejectedValue(this.hasherFailure);
    return this;
  }

  // Signs up with the username and the password, as AuthDtoMapper builds
  // them.
  async whenRegistering(username: string, password: string): Promise<this> {
    return this.when(this.register, username, password);
  }

  // RegisterUser binds UseCase, so LoggingAspect wraps it under its own name
  // (decisions 7 and 10).
  async whenRegisteringThroughTheLoggingAspect(username: string, password: string): Promise<this> {
    return this.when(
      new LoggingAspect(this.register, 'RegisterUser', this.logger, new FakeStopwatch()),
      username,
      password,
    );
  }

  thenTheRegistrationGivesTheIdOfUser(n: number): void {
    expect(this.outcome.value()).toEqual({ ok: true, value: UserMother.id(n) });
  }

  thenTheRegistrationFailsWithUsernameTaken(): void {
    expect(this.outcome.value()).toEqual({ ok: false, error: { kind: 'username-taken' } });
  }

  // An unexpected failure is not a RegisterProblem. HttpErrorFilter turns it into a 500.
  thenTheRegistrationRejectsWithTheHasherFailure(): void {
    expect(this.outcome.rejection()).toBe(this.hasherFailure);
  }

  // The store holds these accounts, in order, each with the hash of its
  // password, never the password.
  thenTheStoredAccountsAre(accounts: readonly StoredAccount[]): void {
    this.outcome.ran();
    expect(this.users.users).toHaveLength(accounts.length);
    for (const [index, account] of accounts.entries()) {
      const parts = userPartsOf(this.users.users[index]);
      expect(receiveValueOf(parts.id)).toBe(testUserId(account.user));
      expect(receiveValueOf(parts.username)).toBe(account.username);
      expect(receiveValueOf(parts.passwordHash)).toBe(`hashed:${account.password}`);
    }
  }

  thenTheStoredUsernamesAre(usernames: readonly string[]): void {
    this.outcome.ran();
    expect(this.users.users.map((user) => receiveValueOf(userPartsOf(user).username))).toEqual(
      usernames,
    );
  }

  thenTheStoreHoldsAccounts(count: number): void {
    this.outcome.ran();
    expect(this.users.users).toHaveLength(count);
  }

  // #90: the port carries domain types, so the use case reads no text.
  thenTheHasherGotThePasswordAndTheStoreKeepsItsHash(password: string): void {
    this.outcome.ran();
    expect(this.hash).toHaveBeenCalledOnce();
    const [given] = this.hash.mock.calls[0];
    expect(given).toBeInstanceOf(Password);
    expect(given.equals(valueOf(Password.create(password)))).toBe(true);
    const [made] = this.madeHashes;
    expect(made?.status === 'fulfilled' && made.value).toBeInstanceOf(PasswordHash);
    expect(userPartsOf(this.users.users[0]).passwordHash).toBe(
      made?.status === 'fulfilled' ? made.value : undefined,
    );
  }

  // #105: the use case passes the values of the request to its ports and to
  // the new User. The first lookup is the one of the use case: the fake
  // add() asks again.
  thenThePortsAndTheUserGotTheValuesOfTheRequest(): void {
    this.outcome.ran();
    expect(this.taken.mock.calls[0][0]).toBe(this.request?.username);
    expect(this.hash).toHaveBeenCalledOnce();
    expect(this.hash.mock.calls[0][0]).toBe(this.request?.password);
    expect(userPartsOf(this.users.users[0]).username).toBe(this.request?.username);
  }

  thenNoPasswordWasHashed(): void {
    this.outcome.ran();
    expect(this.hash).not.toHaveBeenCalled();
  }

  thenTheLogEntriesAre(entries: readonly UseCaseLogEntry[]): void {
    this.outcome.ran();
    expect(this.logger.entries).toEqual(entries);
  }

  thenNoLogEntryHolds(text: string): void {
    this.outcome.ran();
    expect(JSON.stringify(this.logger.entries)).not.toContain(text);
  }

  // Runs the given steps, then signs up. The calls of the ports start again
  // after the given steps.
  private async when(register: RegisterUser, username: string, password: string): Promise<this> {
    await this.arrangements.run();
    this.hash.mockClear();
    this.taken.mockClear();
    const request = registerRequest(username, password);
    this.request = request;
    await this.outcome.record(() => register.execute(request));
    this.madeHashes = await Promise.allSettled(
      this.hash.mock.results.map((result) => result.value as Promise<PasswordHash>),
    );
    return this;
  }
}
