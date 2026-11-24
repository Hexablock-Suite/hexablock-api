import { Logger } from '@nestjs/common';
import { createDatabase } from '../../../src/infrastructure/database/connection.js';

// The pool of these tests never connects: it reads an unreachable URL, and
// pg.Pool opens a connection only on the first query. The error is
// synthetic, emitted on the real pool that the production path creates: it
// exercises the EventEmitter contract of the pool, not a network failure.
const UNUSED_URL = 'postgres://pool-spec:pool-spec@127.0.0.1:1/pool-spec';
const CONNECTION_STRING = 'postgres://user:secret-password@10.0.0.9:5432/db';

describe('the error listener of the pool', () => {
  it('should_log_a_safe_event_when_the_pool_emits_an_idle_client_error', async () => {
    const database = createDatabase(UNUSED_URL);
    const logged = vi.spyOn(Logger.prototype, 'error');
    try {
      const error = Object.assign(new Error(CONNECTION_STRING), { code: 'ECONNRESET' });

      // With no listener an EventEmitter throws its unhandled 'error' event,
      // so the assertion itself keeps the worker alive before the fix.
      expect(() => database.$client.emit('error', error)).not.toThrow();

      expect(logged).toHaveBeenCalledTimes(1);
      const entry = `${logged.mock.calls[0]?.[0]}`;
      expect(entry).toContain('database_pool_error');
      expect(entry).toContain('ECONNRESET');
      expect(entry).not.toContain(CONNECTION_STRING);
      expect(entry).not.toContain('secret-password');
      expect(entry).not.toContain('10.0.0.9');
    } finally {
      logged.mockRestore();
      await database.$client.end();
    }
  });

  it('should_log_the_event_without_a_code_when_the_error_carries_none', async () => {
    const database = createDatabase(UNUSED_URL);
    const logged = vi.spyOn(Logger.prototype, 'error');
    try {
      // Unknown or missing metadata stays out of the line: only the event
      // name and the error name are written.
      expect(() => database.$client.emit('error', new Error(CONNECTION_STRING))).not.toThrow();

      expect(logged).toHaveBeenCalledTimes(1);
      const entry = `${logged.mock.calls[0]?.[0]}`;
      expect(entry).toContain('database_pool_error');
      expect(entry).not.toContain('code=');
      expect(entry).not.toContain(CONNECTION_STRING);
    } finally {
      logged.mockRestore();
      await database.$client.end();
    }
  });
});
