// Drizzle schema of the API. drizzle-kit reads this file to generate the
// migrations in drizzle/. The schema lives in the persistence adapter because
// the repositories query these tables, and rule
// adapters-never-import-infrastructure forbids them to import src/infrastructure.
import { sql } from 'drizzle-orm';
import {
  bigint,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// API-FR-01. The table keeps the password hash, never the plain password.
// The username is stored as typed. The index on lower(username) rejects a
// second name that differs only in letter case (#62).
// The exact constraint users_username_unique stays next to that index.
// The index implies it, so the constraint rejects no other row. Only a new
// migration can drop it, and no change asks for that (#69).
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
  },
  (table) => [uniqueIndex('users_username_lower_unique').on(sql`lower(${table.username})`)],
);

// API-FR-02 and DS-5: one row per user and gameId. highScore and updatedAt
// follow the proposal of classes.md decision 3. The bigint columns hold any
// safe integer of the domain.
export const progress = pgTable(
  'progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    gameId: text('game_id').notNull(),
    highScore: bigint('high_score', { mode: 'number' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.gameId] })],
);

// DS-5: one row per user, gameId and levelId. Each row belongs to one
// progress row, and it goes with that row.
export const levelResults = pgTable(
  'level_results',
  {
    userId: uuid('user_id').notNull(),
    gameId: text('game_id').notNull(),
    levelId: text('level_id').notNull(),
    stars: integer('stars').notNull(),
    moves: integer('moves').notNull(),
    elapsedMs: bigint('elapsed_ms', { mode: 'number' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.gameId, table.levelId] }),
    foreignKey({
      columns: [table.userId, table.gameId],
      foreignColumns: [progress.userId, progress.gameId],
    }).onDelete('cascade'),
  ],
);
