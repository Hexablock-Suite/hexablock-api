import { PasswordHash } from '../../domain/user/password-hash.js';
import { User } from '../../domain/user/user.js';
import { UserId } from '../../domain/user/user-id.js';
import { Username } from '../../domain/user/username.js';
import { receiveUserOf } from '../received.js';
import type { users } from './schema.js';

export type UserRow = typeof users.$inferSelect;

// Turns a users row into the User aggregate and back. toRow() receives the
// parts that the user delivers and the value that each value object
// delivers, and writes the key of the Username into username_key. toEntity()
// restores the user from the row. It reads only the name, and the domain
// computes the key again.
export const UserRowMapper = {
  toEntity(row: UserRow): User {
    const username = Username.create(row.username);
    if (!username.ok) {
      throw new Error(`The users row ${row.id} holds an invalid username.`);
    }
    return User.restore(UserId.from(row.id), username.value, PasswordHash.from(row.passwordHash));
  },

  toRow(user: User): UserRow {
    const { id, username, usernameKey, passwordHash } = receiveUserOf(user);
    return { id, username, usernameKey, passwordHash };
  },
};
