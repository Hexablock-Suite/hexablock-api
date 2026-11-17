import type { UserRepository } from '../../src/application/ports/user-repository.js';
import { err, ok } from '../../src/domain/shared/result.js';
import { PasswordHash } from '../../src/domain/user/password-hash.js';
import { User } from '../../src/domain/user/user.js';
import { UserId } from '../../src/domain/user/user-id.js';
import { Username } from '../../src/domain/user/username.js';
import { valueOf } from './result.js';

// UUIDs, because the users.id column of the Drizzle adapter is a uuid (#64).
const FIRST_ID = '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01';
const SECOND_ID = '0b9e7f4a-5c3d-4e2b-8a1f-9c8d7e6f5a40';

function username(name: string): Username {
  return valueOf(Username.create(name));
}

function userNamed(id: string, name: string): User {
  return User.register(
    valueOf(UserId.from(id)),
    username(name),
    valueOf(PasswordHash.from(`scrypt$${id}`)),
  );
}

// Contract of the UserRepository port (API-FR-01): no two users have names
// that collide (#62). The in-memory fake and the Drizzle adapter run the
// same cases, so the fake promises nothing that the adapter breaks (#100).
export function describeUserRepositoryContract(
  name: string,
  createRepository: () => UserRepository | Promise<UserRepository>,
): void {
  describe(`UserRepository contract: ${name}`, () => {
    // findByUsername() compares the name as typed, letter case included.
    it('should_find_the_stored_user_when_the_name_matches_exactly', async () => {
      const repository = await createRepository();
      const ada = userNamed(FIRST_ID, 'Ada');
      await repository.add(ada);

      const found = await repository.findByUsername(username('Ada'));

      expect(found).toEqual(ada);
    });

    it.each(['ada', 'ADA', 'grace'])(
      'should_return_null_when_no_stored_name_matches_exactly',
      async (asked) => {
        const repository = await createRepository();
        await repository.add(userNamed(FIRST_ID, 'Ada'));

        await expect(repository.findByUsername(username(asked))).resolves.toBeNull();
      },
    );

    // Username.collidesWith() is the business name of the rule (#100), and
    // isUsernameTaken() and add() give its answer. The Drizzle adapter
    // compares the lower case key in SQL, so these pairs pin that the SQL
    // and the domain agree. Every allowed character is ASCII. The last
    // column names the user that findByUsername() gives for the second name.
    it.each([
      ['Ada', 'ada', true, null],
      ['Ada', 'ADA', true, null],
      ['Ada', 'Ada', true, 'first'],
      ['Zz9', 'zZ9', true, null],
      ['grace.hopper', 'Grace.Hopper', true, null],
      ['player_01-x', 'PLAYER_01-X', true, null],
      ['Ada', 'Adb', false, 'second'],
      ['Ada', 'Ada1', false, 'second'],
      ['a-b', 'a_b', false, 'second'],
    ] as const)(
      'should_answer_as_collides_with_when_a_second_name_is_looked_up_and_added',
      async (stored, asked, collide, owner) => {
        const repository = await createRepository();
        const users = { first: userNamed(FIRST_ID, stored), second: userNamed(SECOND_ID, asked) };
        await repository.add(users.first);

        const taken = await repository.isUsernameTaken(username(asked));
        const added = await repository.add(users.second);

        expect(username(stored).collidesWith(username(asked))).toBe(collide);
        expect(taken).toBe(collide);
        expect(added).toEqual(collide ? err('username-taken') : ok(undefined));
        expect(await repository.findByUsername(username(stored))).toEqual(users.first);
        expect(await repository.findByUsername(username(asked))).toEqual(
          owner === null ? null : users[owner],
        );
      },
    );

    // AuthenticateTokenUseCase asks it for the user of a valid token (#137).
    // An id in upper case names the same user: UserId keeps lower case.
    it('should_tell_that_a_user_exists_only_when_a_user_with_the_id_is_stored', async () => {
      const repository = await createRepository();
      await repository.add(userNamed(FIRST_ID, 'Ada'));

      const stored = await repository.exists(valueOf(UserId.from(FIRST_ID.toUpperCase())));
      const missing = await repository.exists(valueOf(UserId.from(SECOND_ID)));

      expect(stored).toBe(true);
      expect(missing).toBe(false);
    });

    // Two sign-ups can both miss the lookup before either one adds. add()
    // still fails for the name that collides, and the store keeps the first user.
    it('should_fail_with_username_taken_when_add_follows_a_lookup_that_missed', async () => {
      const repository = await createRepository();
      const ada = userNamed(FIRST_ID, 'Ada');

      const lookups = [
        await repository.isUsernameTaken(username('Ada')),
        await repository.isUsernameTaken(username('ada')),
      ];
      const first = await repository.add(ada);
      const second = await repository.add(userNamed(SECOND_ID, 'ada'));

      expect(lookups).toEqual([false, false]);
      expect(first).toEqual(ok(undefined));
      expect(second).toEqual(err('username-taken'));
      expect(await repository.findByUsername(username('Ada'))).toEqual(ada);
      await expect(repository.findByUsername(username('ada'))).resolves.toBeNull();
    });
  });
}
