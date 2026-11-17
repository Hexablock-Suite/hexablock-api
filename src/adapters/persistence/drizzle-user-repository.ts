import { eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { UserRepository } from '../../application/ports/user-repository.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { User } from '../../domain/user/user.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { Username } from '../../domain/user/username.js';
import { receiveKeyOf, receiveValueOf } from '../received.js';
import { users } from './schema.js';
import { hasSqlState, UNIQUE_VIOLATION } from './sql-state.js';
import type * as schema from './schema.js';
import { UserRowMapper } from './user-row.mapper.js';

// Any Postgres driver of Drizzle: pg in production, PGlite in the tests.
export type PersistenceDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

// Adapter of the UserRepository port over the users table (API-FR-01).
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: PersistenceDatabase) {}

  // Compares the key that the domain computed, as isUsernameTaken() does
  // (#144). The unique index on username_key keeps one user per key, so the
  // lookup finds one user at most. The found user keeps the stored name.
  async findByUsername(username: Username): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.usernameKey, receiveKeyOf(username)))
      .limit(1);
    return row === undefined ? null : UserRowMapper.toEntity(row);
  }

  // Compares the key that the domain computed (#73). The unique index on
  // username_key answers the lookup. Equal keys are the SQL form of
  // Username.collidesWith(), and the UserRepository contract pins that the
  // two agree (#100).
  async isUsernameTaken(username: Username): Promise<boolean> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.usernameKey, receiveKeyOf(username)))
      .limit(1);
    return rows.length > 0;
  }

  // The unique index on username_key rejects a second user with the same
  // key, also when two sign-ups pass the lookup at the same time.
  async add(user: User): Promise<Result<void, 'username-taken'>> {
    try {
      await this.db.insert(users).values(UserRowMapper.toRow(user));
      return ok(undefined);
    } catch (error) {
      if (hasSqlState(error, UNIQUE_VIOLATION)) {
        return err('username-taken');
      }
      throw error;
    }
  }

  // The primary key on id answers the lookup. The uuid column compares the
  // value, so the letter case of the text does not matter.
  async exists(id: UserId): Promise<boolean> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, receiveValueOf(id)))
      .limit(1);
    return rows.length > 0;
  }
}
