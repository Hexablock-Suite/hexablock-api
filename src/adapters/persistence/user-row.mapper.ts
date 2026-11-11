import { PasswordHash } from '../../domain/user/password-hash.js';
import { User } from '../../domain/user/user.js';
import { UserId } from '../../domain/user/user-id.js';
import { Username } from '../../domain/user/username.js';
import { receiveKeyOf, receiveValueOf } from '../received.js';
import type { users } from './schema.js';

export type UserRow = typeof users.$inferSelect;

// Turns a users row into the User aggregate and back. toRow() reads the
// snapshot of the user, receives each value that a value object delivers,
// and writes the key of the Username into username_key. toEntity() restores
// the user from the row. It reads only the name, and the domain computes the
// key again.
export const UserRowMapper = {
  toEntity(row: UserRow): User {
    const username = Username.create(row.username);
    if (!username.ok) {
      throw new Error(`The users row ${row.id} holds an invalid username.`);
    }
    return User.restore({
      id: UserId.from(row.id),
      username: username.value,
      passwordHash: PasswordHash.from(row.passwordHash),
    });
  },

  toRow(user: User): UserRow {
    const state = user.snapshot();
    return {
      id: receiveValueOf(state.id),
      username: receiveValueOf(state.username),
      usernameKey: receiveKeyOf(state.username),
      passwordHash: receiveValueOf(state.passwordHash),
    };
  },
};
