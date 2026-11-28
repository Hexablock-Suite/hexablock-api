import { AuthenticateTokenTestApi } from './authenticate-token.test-api.js';
import { GetGlobalLeaderboardTestApi } from './get-global-leaderboard.test-api.js';
import { GetLevelLeaderboardTestApi } from './get-level-leaderboard.test-api.js';
import { GetLevelsTestApi } from './get-levels.test-api.js';
import { GetProgressTestApi } from './get-progress.test-api.js';
import { LoginTestApi } from './login.test-api.js';
import { RegisterTestApi } from './register.test-api.js';
import { SyncProgressTestApi } from './sync-progress.test-api.js';
import { WhenOutcome } from './when-outcome.js';

// A then step reads the outcome of a when step. A then step that runs
// before any when step fails, so a when step without await, or no when
// step at all, cannot pass a test that reads an old state (#254).
const TESTING_APIS: [string, () => object][] = [
  ['AuthenticateTokenTestApi', () => new AuthenticateTokenTestApi()],
  ['GetGlobalLeaderboardTestApi', () => new GetGlobalLeaderboardTestApi()],
  ['GetLevelLeaderboardTestApi', () => new GetLevelLeaderboardTestApi()],
  ['GetLevelsTestApi', () => new GetLevelsTestApi()],
  ['GetProgressTestApi', () => new GetProgressTestApi()],
  ['LoginTestApi', () => new LoginTestApi()],
  ['RegisterTestApi', () => new RegisterTestApi()],
  ['SyncProgressTestApi', () => new SyncProgressTestApi()],
];

// The names of the then steps of a Testing API.
function thenStepsOf(api: object): string[] {
  return Object.getOwnPropertyNames(Object.getPrototypeOf(api)).filter((name) =>
    name.startsWith('then'),
  );
}

// Runs one then step with no argument. The guard runs first, so the step
// needs no argument to fail.
function failsWithNoWhenStep(api: object, step: string): boolean {
  const run = Reflect.get(api, step) as () => void;
  try {
    run.call(api);
  } catch (error) {
    return error instanceof Error && error.message === WhenOutcome.NO_WHEN_STEP;
  }
  return false;
}

describe('The Testing APIs of the use case tests', () => {
  it.each(TESTING_APIS)('should_fail_each_then_step_when_no_when_step_ran', (_name, create) => {
    const api = create();
    const steps = thenStepsOf(api);

    expect(steps.length).toBeGreaterThan(0);
    expect(steps.filter((step) => !failsWithNoWhenStep(api, step))).toEqual([]);
  });
});

describe('WhenOutcome', () => {
  const failure = new Error('the port is down');

  it('should_fail_a_then_step_with_the_rejection_when_it_expects_no_rejection', async () => {
    const outcome = new WhenOutcome<number>();

    await outcome.record(() => Promise.reject(failure));

    expect(() => outcome.ran()).toThrow(failure);
  });

  it('should_pass_the_later_then_steps_when_a_then_step_read_the_rejection', async () => {
    const outcome = new WhenOutcome<number>();

    await outcome.record(() => Promise.reject(failure));

    expect(outcome.rejection()).toBe(failure);
    expect(() => outcome.ran()).not.toThrow();
  });

  it('should_fail_the_next_when_step_with_the_rejection_when_no_then_step_read_it', async () => {
    const outcome = new WhenOutcome<number>();
    await outcome.record(() => Promise.reject(failure));

    await expect(outcome.record(() => Promise.resolve(1))).rejects.toBe(failure);
  });

  it('should_fail_the_rejection_step_when_the_when_step_resolved', async () => {
    const outcome = new WhenOutcome<number>();

    await outcome.record(() => Promise.resolve(1));

    expect(outcome.value()).toBe(1);
    expect(() => outcome.rejection()).toThrow('The when step resolved, so it has no rejection.');
  });
});
