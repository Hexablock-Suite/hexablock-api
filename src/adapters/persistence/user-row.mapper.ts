import { PasswordHash } from '../../domain/user/password-hash.js';
import { User } from '../../domain/user/user.js';
import { UserId } from '../../domain/user/user-id.js';
import { Username } from '../../domain/user/username.js';
import type { users } from './schema.js';

export type UserRow = typeof users.$inferSelect;

// Turns a users row into the User entity and back. toRow() writes
// Username.key into username_key. toEntity() reads only the name, and the
// domain computes the key again.
export const UserRowMapper = {
  toEntity(row: UserRow): User {
    const username = Username.create(row.username);
    if (!username.ok) {
      throw new Error(`The users row ${row.id} holds an invalid username.`);
    }
    return new User(UserId.from(row.id), username.value, PasswordHash.from(row.passwordHash));
  },

  toRow(user: User): UserRow {
    return {
      id: user.id.value,
      username: user.username.value,
      usernameKey: user.username.key,
      passwordHash: user.passwordHash.value,
    };
  },
};
