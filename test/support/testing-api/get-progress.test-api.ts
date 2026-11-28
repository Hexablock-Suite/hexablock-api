import {
  type GetProgress,
  GetProgressUseCase,
} from '../../../src/application/progress/get-progress.use-case.js';
import type { ProgressProblem } from '../../../src/application/progress/progress-problem.js';
import type { PlayerProgress } from '../../../src/domain/progress/player-progress.js';
import type { Result } from '../../../src/domain/shared/result.js';
import { InMemoryProgressRepository } from '../in-memory-progress-repository.js';
import { ProgressMother } from '../object-mother/progress-mother.js';
import { UserMother } from '../object-mother/user-mother.js';
import { Arrangements } from './arrangements.js';
import { WhenOutcome } from './when-outcome.js';

// Testing API of GetProgressUseCase (API-FR-02). It builds the use case and
// its test double, and the double stays private: a test names no double. A
// then step fails when no when step ran.
export class GetProgressTestApi {
  private readonly progress = new InMemoryProgressRepository();
  private readonly getProgress: GetProgress = new GetProgressUseCase(this.progress);
  private readonly arrangements = new Arrangements();
  private readonly outcome = new WhenOutcome<Result<PlayerProgress, ProgressProblem>>();

  givenAStoredProgress(progress: PlayerProgress): this {
    this.arrangements.add(() => this.progress.save(progress));
    return this;
  }

  async whenGettingTheProgressOf(user: number, gameId: string): Promise<this> {
    await this.arrangements.run();
    await this.outcome.record(() =>
      this.getProgress.execute({
        userId: UserMother.id(user),
        gameId: ProgressMother.gameId(gameId),
      }),
    );
    return this;
  }

  thenTheProgressIs(progress: PlayerProgress): void {
    expect(this.outcome.value()).toEqual({ ok: true, value: progress });
  }

  thenNoProgressIsFound(): void {
    expect(this.outcome.value()).toEqual({ ok: false, error: { kind: 'progress-not-found' } });
  }
}
