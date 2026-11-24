import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const PROBE = resolve(ROOT, 'test/support/database/pool-end-probe.mjs');
// Example values, the ones of .env.example: they never serve a real user.
const CHILD_ENV = {
  JWT_SECRET: 'example-only-replace-with-32-random-characters',
  DATABASE_URL: 'postgres://shutdown-child:shutdown-child@127.0.0.1:1/shutdown-child',
  LEVEL_EDITOR_IDS: '',
};

// The child runs the compiled production entry, dist/main.js, the file of
// `pnpm start:prod`. The sources of src/ use Nest decorators, which plain
// Node cannot parse, so the spec builds first: the compiled file is always
// the current production code, never a stale dist output.
function buildCurrentProduction(): void {
  const built = spawnSync('pnpm', ['build'], { cwd: ROOT, timeout: 120000 });
  if (built.status !== 0) {
    throw new Error(`pnpm build failed with status ${built.status}.`);
  }
}

// One free port of the machine, ready to hand to the child.
async function freePort(): Promise<string> {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolvePort(String(port)));
    });
  });
}

// Polls the readiness route with a bounded number of tries. The child is up
// only after Nest serves /v1/health, so the spec never signals a child that
// is still starting.
async function waitUntilReady(port: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Not up yet.
    }
    await new Promise((sleep) => setTimeout(sleep, 150));
  }
  throw new Error('The child API never answered /v1/health.');
}

// A dedicated child runs the production bootstrap. The probe of pool.end()
// lives in the child only, so the spec observes the cleanup without
// production logging. The exit by signal alone proves nothing: the
// assertion that matters is that pool.end() ran before the child left.
describe('the shutdown of the API on SIGTERM', () => {
  it('should_close_the_pool_when_sigterm_reaches_the_app', async () => {
    buildCurrentProduction();
    const port = await freePort();
    const child = spawn(process.execPath, ['--import', PROBE, 'dist/main.js'], {
      cwd: ROOT,
      env: { ...CHILD_ENV, PORT: port },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out: string[] = [];
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => out.push(...chunk.split('\n')));
    try {
      await waitUntilReady(port);
      child.kill('SIGTERM');
      const ended = await new Promise<{ code: number | null; signal: string | null }>((settle) => {
        const timer = setTimeout(() => settle({ code: -1, signal: null }), 15000);
        child.once('exit', (code, signal) => {
          clearTimeout(timer);
          settle({ code, signal });
        });
      });
      expect(out.join('\n')).toContain('POOL_END_CALLED');
      expect(ended.code).not.toBe(-1);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  }, 180000);
});
