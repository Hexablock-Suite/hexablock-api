import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const HOOK = resolve(ROOT, 'test/support/node/ts-specifier-hook.mjs');
const CHILD = resolve(ROOT, 'test/support/database/pool-error-child.mjs');

// Reads the lines of a stream until one line matches, with a bounded wait.
function lineFrom(lines: string[], wanted: string, timeoutMs: number): Promise<string> {
  const found = lines.find((line) => line.includes(wanted));
  if (found !== undefined) {
    return Promise.resolve(found);
  }
  return new Promise((resolveLine, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`No "${wanted}" within ${timeoutMs} ms.`)),
      timeoutMs,
    );
    const check = () => {
      const match = lines.find((line) => line.includes(wanted));
      if (match !== undefined) {
        clearTimeout(timer);
        resolveLine(match);
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

// A child that runs the production createDatabase() path, with plain Node on
// the current sources. The error it emits is synthetic: this proves the
// process survives the EventEmitter contract of the pool, not a network
// failure. The child answers a stdin handshake after the error, so the spec
// sees that the process still responds.
describe('the pool error listener in a child process', () => {
  it('should_keep_the_child_responsive_when_the_pool_emits_an_idle_client_error', async () => {
    const child = spawn(process.execPath, ['--experimental-strip-types', '--import', HOOK, CHILD], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out: string[] = [];
    const err: string[] = [];
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => out.push(...chunk.split('\n')));
    child.stderr.on('data', (chunk: string) => err.push(...chunk.split('\n')));
    try {
      await lineFrom(out, 'READY', 10000);
      await lineFrom(out, 'EMITTED', 5000);
      child.stdin?.write('ping\n');
      await lineFrom(out, 'pong', 5000);
      const written = [...out, ...err].join('\n');
      expect(written).toContain('database_pool_error');
      expect(written).not.toContain('synthetic idle-client error');
      child.stdin?.write('exit\n');
      const code: number | null = await new Promise((resolveExit) => {
        child.once('exit', (exitCode) => resolveExit(exitCode));
        setTimeout(() => resolveExit(-1), 5000);
      });
      expect(code).toBe(0);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  }, 20000);
});
