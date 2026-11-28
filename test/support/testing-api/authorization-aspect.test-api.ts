import { AuthorizationAspect } from '../../../src/application/aspects/authorization-aspect.js';
import { UseCaseAspect } from '../../../src/application/aspects/use-case-aspect.js';
import type {
  UpdateLevels,
  UpdateLevelsError,
  UpdateLevelsRequest,
} from '../../../src/application/levels/update-levels.use-case.js';
import { err, ok, type Result } from '../../../src/domain/shared/result.js';
import type { LevelEditors } from '../../../src/domain/user/level-editors.js';
import { levelJson } from '../level-format.js';
import { incomingLevel } from '../level-update.js';
import { UserMother } from '../object-mother/user-mother.js';
import { invalidLevelsOf, type LevelProblemRow } from './update-levels.test-api.js';
import { WhenOutcome } from './when-outcome.js';

// The answer of the inner update as a test names it: the batch is saved,
// or it breaks the rules of these rows.
export type InnerUpdateAnswer = 'saved' | { readonly invalid: readonly LevelProblemRow[] };

type UpdateAnswer = Result<void, UpdateLevelsError>;

// Testing API of AuthorizationAspect (#180) over an inner UpdateLevels. It
// builds the aspect and its test doubles, and the doubles stay private: a
// test names no double. The inner update is a stand-in: it keeps each
// request and gives the answer of the given step. Each update sends one
// valid level. A then step fails when no when step ran.
export class AuthorizationAspectTestApi {
  private editors: LevelEditors = UserMother.levelEditors([]);
  private innerAnswer: UpdateAnswer = ok(undefined);
  private readonly innerRequests: UpdateLevelsRequest[] = [];
  private readonly inner: UpdateLevels = {
    execute: (request) => {
      this.innerRequests.push(request);
      return Promise.resolve(this.innerAnswer);
    },
  };
  private readonly outcome = new WhenOutcome<UpdateAnswer>();
  private aspect: UpdateLevels | undefined;
  private request: UpdateLevelsRequest | undefined;

  givenTheLevelEditors(users: readonly number[]): this {
    this.editors = UserMother.levelEditors(users);
    return this;
  }

  givenTheInnerUpdateAnswers(answer: InnerUpdateAnswer): this {
    this.innerAnswer = answer === 'saved' ? ok(undefined) : err(invalidLevelsOf(answer.invalid));
    return this;
  }

  // User n sends one valid level, as LevelDtoMapper builds the request.
  async whenUserUpdates(user: number): Promise<this> {
    const aspect = new AuthorizationAspect(this.inner, this.editors);
    const request = { userId: UserMother.id(user), levels: [incomingLevel(levelJson('hexa-fit'))] };
    this.aspect = aspect;
    this.request = request;
    await this.outcome.record(() => aspect.execute(request));
    return this;
  }

  thenTheUpdateFailsWithNotALevelEditor(): void {
    expect(this.outcome.value()).toEqual({ ok: false, error: { kind: 'not-a-level-editor' } });
  }

  // The aspect gives the very answer of the inner update.
  thenTheAspectGivesTheInnerResultUnchanged(): void {
    expect(this.outcome.value()).toBe(this.innerAnswer);
  }

  thenTheInnerUpdateDidNotRun(): void {
    this.outcome.ran();
    expect(this.innerRequests).toEqual([]);
  }

  thenTheInnerUpdateRanOnceWithTheRequest(): void {
    this.outcome.ran();
    expect(this.innerRequests).toEqual([this.request]);
  }

  thenTheAspectIsAUseCaseAspect(): void {
    this.outcome.ran();
    expect(this.aspect).toBeInstanceOf(UseCaseAspect);
  }
}
