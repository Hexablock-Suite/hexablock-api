import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../adapters/persistence/schema.js';

export type Database = NodePgDatabase<typeof schema> & { $client: pg.Pool };

// Only the infrastructure reads the environment. The URL has the shape
// postgres://user:password@host:port/database.
export function readDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy the value from compose.yaml for local work.');
  }
  return url;
}

export function createDatabase(url: string = readDatabaseUrl()): Database {
  return drizzle({ client: new pg.Pool({ connectionString: url }), schema });
}
