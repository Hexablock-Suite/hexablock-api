import { receiveValueOf } from '../../../src/adapters/received.js';
import type { LoginRequest } from '../../../src/application/auth/credentials.js';
import {
  type Login,
  type LoginProblem,
  LoginUseCase,
} from '../../../src/application/auth/login.use-case.js';
import { RegisterUseCase } from '../../../src/application/auth/register.use-case.js';
import type { SessionToken } from '../../../src/application/auth/session-token.js';
import type { PasswordHasher } from '../../../src/application/ports/password-hasher.js';
import type { Result } from '../../../src/domain/shared/result.js';
import { Password } from '../../../src/domain/user/password.js';
import { PasswordAttempt } from '../../../src/domain/user/password-attempt.js';
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import {
  InMemoryUserRepository,
  PrefixPasswordHasher,
  PrefixTokenIssuer,
  SequenceUserIdGenerator,
} from '../auth/fakes.js';
import { loginRequest, registerRequest } from '../auth/requests.js';
import { testUserId } from '../user-ids.js';
import { Arrangements } from './arrangements.js';
import { WhenOutcome } from './when-outcome.js';

// The text of the dummy password of LoginUseCase, as PrefixPasswordHasher hashes it.
const DUMMY_HASH = 'hashed:unknown-user-dummy-password';

// What one build of the use case left: the use case, the passwords that the
// constructor hashed and the dummy hash that it started.
interface Built {
  readonly login: Login;
  readonly hashed: readonly Password[];
  readonly startedDummyHash: PasswordHash | undefined;
}

// Testing API of LoginUseCase (API-FR-01). It builds the use case and its
// test doubles, and the doubles stay private: a test names no double. The
// given steps prepare the accounts and the hasher, the when steps build the
// use case or sign in, and the then steps check the answer and the calls of
// the ports. The ports are the boundary of the hexagon, so a then step
// counts their calls. A then step fails when no when step ran.
export class LoginTestApi {
  private readonly users = new InMemoryUserRepository();
  private readonly prefixHasher = new PrefixPasswordHasher();
  private readonly tokens = new PrefixTokenIssuer();
  private readonly ids = new SequenceUserIdGenerator();
  private readonly hash = vi.spyOn(this.prefixHasher, 'hash');
  private readonly verify = vi.spyOn(this.prefixHasher, 'verify');
  private readonly find = vi.spyOn(this.users, 'findByUsername');
  private readonly issue = vi.spyOn(this.tokens, 'issue');
  private readonly hasherFailure = new Error('the hasher is down');
  private hasher: PasswordHasher = this.prefixHasher;
  private readonly arrangements = new Arrangements();
  private readonly build = new WhenOutcome<Built>();
  private readonly signIn = new WhenOutcome<Result<SessionToken, LoginProblem>>();
  private unhandled: unknown[] = [];
  private request: LoginRequest | undefined;
  private builtOnce: Built | undefined;

  // The account signs up through RegisterUseCase, as a player does.
  givenARegisteredUser(username: string, password: string): this {
    this.arrangements.add(() =>
      new RegisterUseCase(this.users, this.prefixHasher, this.ids).execute(
        registerRequest(username, password),
      ),
    );
    return this;
  }

  // Every check of the hasher rejects with a failure of the hasher.
  givenTheHasherFailsEveryCheck(): this {
    this.verify.mockRejectedValue(this.hasherFailure);
    return this;
  }

  // Every hash rejects, the dummy hash that the constructor starts included.
  // A vi.fn spy handles the promises that it returns, so this hasher is a
  // plain object.
  givenTheHasherFailsEveryHash(): this {
    this.hasher = {
      hash: () => Promise.reject(this.hasherFailure),
      verify: () => Promise.resolve(false),
    };
    return this;
  }

  // Builds the use case, then waits one turn of the event loop. It records
  // each rejection that no code handled in that time.
  async whenTheUseCaseIsBuilt(): Promise<this> {
    const record = (reason: unknown) => this.unhandled.push(reason);
    process.on('unhandledRejection', record);
    try {
      await this.build.record(async () => {
        const built = await this.built();
        await new Promise((resolve) => setTimeout(resolve, 0));
        return built;
      });
    } finally {
      process.off('unhandledRejection', record);
    }
    return this;
  }

  // Signs in with the username and the typed text, as AuthDtoMapper builds
  // them. The use case is built once, before the first sign-in.
  async whenSigningIn(username: string, typed: string): Promise<this> {
    const { login } = await this.built();
    const request = loginRequest(username, typed);
    this.request = request;
    await this.signIn.record(() => login.execute(request));
    return this;
  }

  thenTheSignInGivesTheTokenOfUser(n: number): void {
    expect(this.signIn.value()).toEqual({ ok: true, value: `token-for:${testUserId(n)}` });
  }

  thenTheSignInFailsWithInvalidCredentials(): void {
    expect(this.signIn.value()).toEqual({ ok: false, error: { kind: 'invalid-credentials' } });
  }

  thenTheSignInRejectsWithTheHasherFailure(): void {
    expect(this.signIn.rejection()).toBe(this.hasherFailure);
  }

  // The hasher checked the typed text once, against the dummy hash.
  thenThePasswordWasCheckedOnceAgainstTheDummyHash(typed: string): void {
    this.signIn.ran();
    expect(this.verify).toHaveBeenCalledOnce();
    expect(checksOf(this.verify.mock.calls)).toEqual([[typed, DUMMY_HASH]]);
  }

  // The hasher checked the typed text once, against the very hash that the
  // constructor started.
  thenTheAttemptWasCheckedOnceAgainstTheStartedDummyHash(typed: string): void {
    this.signIn.ran();
    expect(this.verify).toHaveBeenCalledOnce();
    expect(receiveValueOf(this.verify.mock.calls[0][0])).toBe(typed);
    expect(this.verify.mock.calls[0][1]).toBe(this.builtOnce?.startedDummyHash);
  }

  // The hasher checked the typed text once, against the stored hash of the
  // password of sign-up.
  thenThePasswordWasCheckedOnceAgainstTheStoredHashOf(typed: string, stored: string): void {
    this.signIn.ran();
    expect(this.verify).toHaveBeenCalledOnce();
    expect(checksOf(this.verify.mock.calls)).toEqual([[typed, `hashed:${stored}`]]);
  }

  thenThePasswordWasCheckedOnce(): void {
    this.signIn.ran();
    expect(this.verify).toHaveBeenCalledOnce();
  }

  thenNoPasswordWasChecked(): void {
    this.signIn.ran();
    expect(this.verify).not.toHaveBeenCalled();
  }

  thenNoPasswordWasHashedDuringTheSignIn(): void {
    this.signIn.ran();
    expect(this.hash).not.toHaveBeenCalled();
  }

  thenNoPasswordWasCheckedOrHashed(): void {
    this.signIn.ran();
    expect(this.verify).not.toHaveBeenCalled();
    expect(this.hash).not.toHaveBeenCalled();
  }

  // #90: the port carries domain types. #98: the typed text reaches the
  // port as a PasswordAttempt.
  thenTheHasherGotTheTypedTextAsAnAttemptAndAStoredHash(typed: string): void {
    this.signIn.ran();
    const [attempt, hash] = this.verify.mock.calls[0];
    expect(attempt).toBeInstanceOf(PasswordAttempt);
    expect(receiveValueOf(attempt)).toBe(typed);
    expect(hash).toBeInstanceOf(PasswordHash);
  }

  thenTheUseCaseHashedOneDummyPassword(): void {
    const { hashed } = this.build.value();
    expect(hashed).toHaveLength(1);
    expect(hashed[0]).toBeInstanceOf(Password);
  }

  thenNoRejectionWasUnhandled(): void {
    this.build.ran();
    expect(this.unhandled).toEqual([]);
  }

  // #91: the token issuer takes the stored user.
  thenTheTokenIssuerGotTheStoredUserOnce(): void {
    this.signIn.ran();
    expect(this.issue).toHaveBeenCalledOnce();
    expect(this.issue.mock.calls[0][0]).toBe(this.users.users[0]);
  }

  thenNoTokenWasIssued(): void {
    this.signIn.ran();
    expect(this.issue).not.toHaveBeenCalled();
  }

  // #105: the use case passes the values of the request to its ports.
  thenThePortsGotTheUsernameAndTheAttemptOfTheRequest(): void {
    this.signIn.ran();
    expect(this.find).toHaveBeenCalledOnce();
    expect(this.find.mock.calls[0][0]).toBe(this.request?.username);
    expect(this.verify).toHaveBeenCalledOnce();
    expect(this.verify.mock.calls[0][0]).toBe(this.request?.attempt);
  }

  thenNoPortWasCalled(): void {
    this.signIn.ran();
    expect(this.find).not.toHaveBeenCalled();
    expect(this.verify).not.toHaveBeenCalled();
    expect(this.issue).not.toHaveBeenCalled();
  }

  // Runs the given steps and builds the use case once. The calls of the
  // ports start again after the build, so a then step sees only the calls
  // of the when steps. The constructor starts the dummy hash.
  private async built(): Promise<Built> {
    await this.arrangements.run();
    if (this.builtOnce === undefined) {
      this.clearCalls();
      const login = new LoginUseCase(this.users, this.hasher, this.tokens);
      const hashed = this.hash.mock.calls.map(([password]) => password);
      const started = this.hash.mock.results[0]?.value as Promise<PasswordHash> | undefined;
      this.clearCalls();
      this.builtOnce = { login, hashed, startedDummyHash: await started };
    }
    return this.builtOnce;
  }

  private clearCalls(): void {
    for (const spy of [this.hash, this.verify, this.find, this.issue]) {
      spy.mockClear();
    }
  }
}

// The checks that the PasswordHasher port saw: the typed text and the hash
// text of each call. A test double of a port is border code, so it receives
// the text. It receives the hash text too: a structural comparison ignores
// the ECMAScript private field of a PasswordHash (#138).
function checksOf(
  calls: readonly (readonly [PasswordAttempt, PasswordHash])[],
): (readonly [string, string])[] {
  return calls.map(([attempt, hash]) => [receiveValueOf(attempt), receiveValueOf(hash)] as const);
}
