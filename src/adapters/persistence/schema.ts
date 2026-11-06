// Drizzle schema of the API. drizzle-kit reads this file to generate the
// migrations in drizzle/. The schema lives in the persistence adapter because
// the repositories query these tables, and rule
// adapters-never-import-infrastructure forbids them to import src/infrastructure.
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

// API-FR-01. The table keeps the password hash, never the plain password.
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
});
