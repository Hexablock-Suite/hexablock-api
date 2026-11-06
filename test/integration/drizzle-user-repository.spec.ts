import { sql } from 'drizzle-orm';
import { DrizzleUserRepository } from '../../src/adapters/persistence/drizzle-user-repository.js';
import { users } from '../../src/adapters/persistence/schema.js';
import { RegisterUseCase } from '../../src/application/auth/register.use-case.js';
import { PasswordHash } from '../../src/domain/user/password-hash.js';
import { User } from '../../src/domain/user/user.js';
import { UserId } from '../../src/domain/user/user-id.js';
import { Username } from '../../src/domain/user/username.js';
import { PrefixPasswordHasher } from '../support/auth/fakes.js';
import { createTestDatabase, type TestDatabase } from '../support/test-database.js';

const ADA_ID = '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01';
const OTHER_ID = '0b9e7f4a-5c3d-4e2b-8a1f-9c8d7e6f5a40';

function userNamed(id: string, name: string, hash: string): User {
  const username = Username.create(name);
  if (!username.ok) {
    throw new Error(`invalid test username ${name}`);
  }
  return new User(UserId.from(id), username.value, PasswordHash.from(hash));
}

function username(name: string): Username {
  return userNamed(ADA_ID, name, 'unused').username;
}

// API-FR-01: the users table and its repository on PGlite (R-database-harness).
describe('DrizzleUserRepository', () => {
  let database: TestDatabase;
  let repository: DrizzleUserRepository;

  beforeEach(async () => {
    database = await createTestDatabase();
    repository = new DrizzleUserRepository(database.db);
  });

  afterEach(async () => {
    await database.close();
  });

  it('should_create_users_table_when_migrations_run', async () => {
    const result = await database.db.execute<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      sql`select column_name, data_type, is_nullable from information_schema.columns
          where table_name = 'users' order by column_name`,
    );

    expect(result.rows).toEqual([
      { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'password_hash', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'username', data_type: 'text', is_nullable: 'NO' },
    ]);
  });

  it('should_return_added_user_when_username_matches', async () => {
    const ada = userNamed(ADA_ID, 'ada', 'scrypt$hash');
    await repository.add(ada);

    const found = await repository.findByUsername(username('ada'));

    expect(found).toEqual(ada);
  });

  it('should_return_null_when_username_is_unknown', async () => {
    await repository.add(userNamed(ADA_ID, 'ada', 'scrypt$hash'));

    const found = await repository.findByUsername(username('grace'));

    expect(found).toBeNull();
  });

  it('should_report_username_taken_when_insert_breaks_unique_constraint', async () => {
    await repository.add(userNamed(ADA_ID, 'ada', 'scrypt$hash'));

    const result = await repository.add(userNamed(OTHER_ID, 'ada', 'scrypt$other'));

    expect(result).toEqual({ ok: false, error: 'username-taken' });

    const count = await database.db.execute<{ count: number }>(
      sql`select count(*)::int as count from users`,
    );
    expect(count.rows).toEqual([{ count: 1 }]);
  });

  it('should_fail_with_username_taken_when_registration_loses_the_race', async () => {
    await repository.add(userNamed(ADA_ID, 'ada', 'scrypt$hash'));
    // The lookup misses, as when two sign-ups run at the same time.
    vi.spyOn(repository, 'findByUsername').mockResolvedValue(null);
    const register = new RegisterUseCase(repository, new PrefixPasswordHasher(), {
      next: () => UserId.from(OTHER_ID),
    });

    const result = await register.execute({ username: 'ada', password: 'other password' });

    expect(result).toEqual({ ok: false, error: { kind: 'username-taken' } });
    const rows = await database.db.select().from(users);
    expect(rows).toEqual([{ id: ADA_ID, username: 'ada', passwordHash: 'scrypt$hash' }]);
  });
});
