import { readFileSync } from 'node:fs';
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

  it('should_keep_required_job_name_when_workflow_changes', () => {
    expect(workflow).toMatch(/^ {2}verify:\n {4}name: verify$/m);
    expect(workflow).toMatch(/^ {6}- run: pnpm verify$/m);
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
});
