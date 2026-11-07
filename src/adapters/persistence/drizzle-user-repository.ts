import { eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { UserRepository } from '../../application/ports/user-repository.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { User } from '../../domain/user/user.js';
import type { Username } from '../../domain/user/username.js';
import { users } from './schema.js';
import type * as schema from './schema.js';
import { UserRowMapper } from './user-row.mapper.js';

// Any Postgres driver of Drizzle: pg in production, PGlite in the tests.
export type PersistenceDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

// Adapter of the UserRepository port over the users table (API-FR-01).
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: PersistenceDatabase) {}

  async findByUsername(username: Username): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username.value))
      .limit(1);
    return row === undefined ? null : UserRowMapper.toEntity(row);
  }

  // The expression matches the unique index on lower(username), so the
  // index answers the lookup.
  async isUsernameTaken(username: Username): Promise<boolean> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${username.value})`)
      .limit(1);
    return rows.length > 0;
  }

  // The unique index on lower(username) rejects a second user whose name
  // differs only in letter case, also when two sign-ups pass the lookup at
  // the same time.
  async add(user: User): Promise<Result<void, 'username-taken'>> {
    try {
      await this.db.insert(users).values(UserRowMapper.toRow(user));
      return ok(undefined);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return err('username-taken');
      }
      throw error;
    }
  }
}

// Postgres code 23505 is unique_violation. Drizzle wraps the driver error
// in its own error and keeps the driver error as the cause.
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) {
      return true;
    }
  }
  return false;
}
