import { LevelEditors } from '../../../src/domain/user/level-editors.js';
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import { User } from '../../../src/domain/user/user.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { Username } from '../../../src/domain/user/username.js';
import { valueOf } from '../result.js';
import { testUserId } from '../user-ids.js';

// Object Mother of the user data of the tests. It builds domain values with
// the public factories only: the constructor of User is private. It knows no
// test double.
export class UserMother {
  // The id of user n: testUserId(n).
  static id(n: number): UserId {
    return valueOf(UserId.from(testUserId(n)));
  }

  // The stored account of user 1, ada, with a hash that no test checks.
  static ada(): User {
    return User.register(
      UserMother.id(1),
      valueOf(Username.create('ada')),
      valueOf(PasswordHash.from('scrypt$hash')),
    );
  }

  // The list of level editors that holds the id of each user n.
  static levelEditors(users: readonly number[]): LevelEditors {
    return LevelEditors.of(users.map((n) => UserMother.id(n)));
  }
}
