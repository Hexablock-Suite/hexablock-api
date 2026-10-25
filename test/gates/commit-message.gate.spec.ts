import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const COMMITLINT = resolve(ROOT, 'node_modules/.bin/commitlint');

// Runs commitlint with the project config on one message, as the
// commit-msg hook and the CI step do.
function lintMessage(message: string): number | null {
  const run = spawnSync(COMMITLINT, [], { cwd: ROOT, input: message, encoding: 'utf8' });
  if (run.error) {
    throw run.error;
  }
  return run.status;
}

// Gate S2: commit messages follow Conventional Commits.
describe('commit-message gate', () => {
  it('should_reject_message_when_it_lacks_a_conventional_type', () => {
    expect(lintMessage('bad message')).not.toBe(0);
  });

  it('should_accept_message_when_it_follows_conventional_commits', () => {
    expect(lintMessage('feat(http): add the health endpoint')).toBe(0);
  });
});
