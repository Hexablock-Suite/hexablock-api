import { RegisterUseCase } from '../../../src/application/auth/register.use-case.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import {
  InMemoryUserRepository,
  PrefixPasswordHasher,
  SequenceUserIdGenerator,
} from '../../support/auth/fakes.js';

describe('RegisterUseCase', () => {
  let users: InMemoryUserRepository;
  let register: RegisterUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    register = new RegisterUseCase(
      users,
      new PrefixPasswordHasher(),
      new SequenceUserIdGenerator(),
    );
  });

  it('should_store_hashed_password_when_user_registers', async () => {
    const result = await register.execute({ username: 'ada', password: 'correct horse' });

    expect(result).toEqual({ ok: true, value: UserId.from('user-1') });
    expect(users.users).toHaveLength(1);
    expect(users.users[0].id.value).toBe('user-1');
    expect(users.users[0].username.value).toBe('ada');
    expect(users.users[0].passwordHash.value).toBe('hashed:correct horse');
  });

  it('should_fail_with_username_taken_when_username_exists', async () => {
    await register.execute({ username: 'ada', password: 'correct horse' });

    const result = await register.execute({ username: 'ada', password: 'other password' });

    expect(result).toEqual({ ok: false, error: { kind: 'username-taken' } });
    expect(users.users).toHaveLength(1);
    expect(users.users[0].passwordHash.value).toBe('hashed:correct horse');
  });

  it('should_fail_with_each_invalid_field_when_credentials_break_the_rules', async () => {
    const result = await register.execute({ username: 'a!', password: 'short' });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'invalid-credentials', fields: ['username', 'password'] },
    });
    expect(users.users).toHaveLength(0);
  });
});
