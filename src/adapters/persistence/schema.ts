// Drizzle schema of the API. drizzle-kit reads this file to generate the
// migrations in drizzle/. The schema lives in the persistence adapter because
// the repositories query these tables, and rule
// adapters-never-import-infrastructure forbids them to import src/infrastructure.
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
// The username is stored as typed. username_key holds Username.key, which
// the domain computes. Its unique index rejects a second name with the same
// key, so `Ada` after `ada` fails (#62). The database applies no letter case
// rule of its own (#73).
// The exact constraint users_username_unique stays next to that index. It
// also rejects a writer that skips the repository and stores the same name
// with another key.
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    username: text('username').notNull().unique(),
    usernameKey: text('username_key').notNull(),
    passwordHash: text('password_hash').notNull(),
  },
  (table) => [uniqueIndex('users_username_key_unique').on(table.usernameKey)],
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
