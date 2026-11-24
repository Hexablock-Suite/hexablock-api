import { Logger } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../adapters/persistence/schema.js';

export type Database = NodePgDatabase<typeof schema> & { $client: pg.Pool };

// The stable name of the pool error event of the log (#173).
const DATABASE_POOL_ERROR = 'database_pool_error';
const POOL_LOGGER = new Logger('DatabaseModule');

// Only the infrastructure reads the environment. The URL has the shape
// postgres://user:password@host:port/database.
export function readDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy the value from compose.yaml for local work.');
  }
  return url;
}

// An idle client that loses its connection emits 'error' on the pool, and an
// unhandled 'error' event of an EventEmitter ends the process (#173). The
// listener keeps the process up and writes one entry: the event name, the
// error name and the error code when the code is a text, as the entries of
// NestLogger do. The entry never writes the message of the error, which can
// quote a connection string, and the listener does not make a failed query
// pass and does not keep the database reachable.
function listenToPoolErrors(pool: pg.Pool): void {
  pool.on('error', (error: Error & { code?: unknown }) => {
    const code = typeof error.code === 'string' ? error.code : undefined;
    POOL_LOGGER.error(
      `event=${DATABASE_POOL_ERROR} error=${error.name}${code === undefined ? '' : ` code=${code}`}`,
    );
  });
}

export function createDatabase(url: string = readDatabaseUrl()): Database {
  const pool = new pg.Pool({ connectionString: url });
  listenToPoolErrors(pool);
  return drizzle({ client: pool, schema });
}
