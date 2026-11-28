import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8');

// The CI workflow decides what merges. These checks pin its contract.
describe('CI contract', () => {
  const workflow = read('.github/workflows/ci.yml');
  const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;

  it('should_run_gates_in_fixed_order_when_verify_is_called', () => {
    expect(scripts.verify).toBe(
      'pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm arch && pnpm openapi:check',
    );
  });

  // #253: `pnpm test` runs the behavior tests and the gate tests, so the
  // `verify` job runs every gate. test/gates/test-suites.gate.spec.ts shows
  // that these two configs select every file of both suites.
  it('should_run_every_test_file_when_verify_runs_pnpm_test', () => {
    expect(scripts.test).toBe('vitest run && vitest run --config ./vitest.config.e2e.ts');
  });

  it('should_keep_required_job_names_when_workflow_changes', () => {
    expect(workflow).toMatch(/^ {2}verify:\n {4}name: verify$/m);
    expect(workflow).toMatch(/^ {6}- run: pnpm verify$/m);
    expect(workflow).toMatch(/^ {2}contract:\n {4}name: contract$/m);
    expect(workflow).toMatch(/^ {6}- run: pnpm contract:verify$/m);
  });

  it('should_verify_client_pact_when_contract_job_runs', () => {
    expect(scripts['contract:verify']).toBe('node scripts/contract/verify-provider.js');
    expect(read('scripts/contract/verify-provider.js')).toContain(
      'https://raw.githubusercontent.com/Hexablock-Suite/hexablock-app/main/pacts/hexablock-app-hexablock-api.json',
    );
  });

  // #151: the verifier posts each provider state to the state-change
  // endpoint, which only the provider composition mounts. dist/main.js
  // answers that call with 404, so the contract job never starts it.
  it('should_start_the_provider_composition_when_contract_job_starts_the_api', () => {
    const job = /^ {2}contract:\n[\s\S]*?(?=^ {2}[a-z-]+:$|(?![\s\S]))/m.exec(workflow)?.[0] ?? '';

    expect(job).toContain('node --env-file=.env.example scripts/contract/start-provider.js');
    expect(job).not.toContain('dist/main.js');
  });

  it('should_use_pinned_node_when_ci_sets_up_node', () => {
    expect(read('.node-version').trim()).toBe('26');
    expect(workflow).toContain('node-version-file: .node-version');
  });

  it('should_repeat_every_hook_check_when_ci_runs', () => {
    expect(read('.vite-hooks/commit-msg')).toContain('commitlint --edit');
    expect(workflow).toContain('pnpm exec commitlint --from');
    expect(read('.vite-hooks/pre-push')).toContain('pnpm lint && pnpm typecheck && pnpm arch');
    expect(read('.vite-hooks/pre-commit')).toContain('vp staged');
  });

  // PGlite runs one session, so only the postgres-lock job proves an advisory
  // lock (rule R-database-harness). A lock spec that the job does not list
  // would pass every other job without a test of its lock.
  it('should_run_every_lock_spec_when_postgres_lock_job_runs', () => {
    const job = /^ {2}postgres-lock:\n[\s\S]*?(?=^ {2}[a-z-]+:$)/m.exec(workflow)?.[0] ?? '';
    const lockSpecs = readdirSync(resolve(ROOT, 'test/integration'))
      .filter((file) => file.endsWith('.concurrency.spec.ts'))
      .map((file) => `test/integration/${file}`);

    expect(lockSpecs.length).toBeGreaterThan(0);
    expect(lockSpecs.filter((spec) => !job.includes(spec))).toEqual([]);
    expect(job).toContain('--no-file-parallelism');
  });
});
