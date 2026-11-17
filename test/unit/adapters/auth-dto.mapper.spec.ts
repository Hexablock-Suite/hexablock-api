import { AuthDtoMapper } from '../../../src/adapters/http/auth-dto.mapper.js';
import { receiveValueOf } from '../../../src/adapters/received.js';
import { Password } from '../../../src/domain/user/password.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { Username } from '../../../src/domain/user/username.js';
import { testUserId } from '../../support/user-ids.js';
import { valueOf } from '../../support/result.js';

// One code point, two UTF-16 units.
const EMOJI = '\u{1F600}';
const USERNAME_RULE =
  'username must have 3 to 32 characters: letters, digits, dots, hyphens or underscores';
const PASSWORD_RULE = 'password must have 8 to 128 characters';
const USERNAME_SHAPE = 'username must be a string';
const PASSWORD_SHAPE = 'password must be a string';

// The shapes of a body that holds no two strings. The app has no
// validation pipe, so the mapper gets the parsed JSON as it arrives.
const BROKEN_SHAPES: [unknown, string[]][] = [
  [{}, [USERNAME_SHAPE, PASSWORD_SHAPE]],
  [{ username: 7 }, [USERNAME_SHAPE, PASSWORD_SHAPE]],
  [{ username: 'ada' }, [PASSWORD_SHAPE]],
  [{ password: 'correct horse battery' }, [USERNAME_SHAPE]],
  [{ username: null, password: ['correct horse battery'] }, [USERNAME_SHAPE, PASSWORD_SHAPE]],
  [{ username: 'a!', password: 5 }, [PASSWORD_SHAPE]],
  [[], [USERNAME_SHAPE, PASSWORD_SHAPE]],
  ['ada', [USERNAME_SHAPE, PASSWORD_SHAPE]],
  [null, [USERNAME_SHAPE, PASSWORD_SHAPE]],
];

// Names that break the username rule: a character outside the rule, fewer
// than 3 or more than 32 characters.
const BROKEN_USERNAMES = ['a!', 'ab', '', 'a'.repeat(33), 'ada lovelace', `ad${EMOJI}`];

// #105: AuthDtoMapper checks the body shape, builds the domain values of
// the account requests and writes the rule messages. So AuthController
// holds no translation code, and no account use case builds a domain value
// (decision 12).
describe('AuthDtoMapper.toRegisterRequest', () => {
  it('should_build_the_username_and_the_password_when_the_sign_up_body_is_valid', () => {
    const request = AuthDtoMapper.toRegisterRequest({
      username: 'Ada',
      password: 'correct horse battery',
    });

    if (!request.ok) {
      throw new Error('The mapper must build the request.');
    }
    expect(request.value.username).toBeInstanceOf(Username);
    expect(request.value.username.equals(valueOf(Username.create('Ada')))).toBe(true);
    expect(request.value.password).toBeInstanceOf(Password);
    expect(request.value.password.equals(valueOf(Password.create('correct horse battery')))).toBe(
      true,
    );
  });

  // The shape check runs first. A field that is not a string gives its
  // shape problem, and no rule message of the other field.
  it.each(BROKEN_SHAPES)(
    'should_fail_with_the_shape_problem_of_each_field_when_a_sign_up_field_is_missing_or_not_a_string',
    (body, problems) => {
      expect(AuthDtoMapper.toRegisterRequest(body)).toEqual({ ok: false, error: problems });
    },
  );

  // The mapper checks both fields before it answers, so the answer names
  // each broken field, username first.
  it.each([
    [{ username: 'a!', password: 'short' }, [USERNAME_RULE, PASSWORD_RULE]],
    [{ username: 'a'.repeat(33), password: 'x'.repeat(129) }, [USERNAME_RULE, PASSWORD_RULE]],
    [{ username: 'a!', password: 'correct horse battery' }, [USERNAME_RULE]],
    [{ username: 'ada', password: 'short' }, [PASSWORD_RULE]],
    [{ username: 'ada', password: EMOJI.repeat(4) }, [PASSWORD_RULE]],
    [{ username: 'ada', password: EMOJI.repeat(129) }, [PASSWORD_RULE]],
  ])(
    'should_fail_with_the_message_of_each_broken_rule_username_first_when_sign_up_values_break_their_rules',
    (body, problems) => {
      expect(AuthDtoMapper.toRegisterRequest(body)).toEqual({ ok: false, error: problems });
    },
  );

  // The limits of the domain ranges hold at both ends.
  it.each([
    ['ada', 'x'.repeat(8)],
    ['a'.repeat(32), 'x'.repeat(128)],
    ['Grace.Hopper_01-x', EMOJI.repeat(128)],
  ])(
    'should_build_the_request_when_each_value_sits_on_a_limit_of_its_rule',
    (username, password) => {
      expect(AuthDtoMapper.toRegisterRequest({ username, password }).ok).toBe(true);
    },
  );

  // #138: a logger or an error body can write the request with
  // JSON.stringify(). The Password keeps its text in an ECMAScript private
  // field, so JSON shows the username but no typed text.
  it('should_show_no_typed_text_when_json_receives_the_register_request', () => {
    const request = AuthDtoMapper.toRegisterRequest({
      username: 'Ada',
      password: 'correct horse battery',
    });

    if (!request.ok) {
      throw new Error('The mapper must build the request.');
    }
    expect(JSON.stringify(request.value)).not.toContain('correct horse battery');
    expect(receiveValueOf(request.value.password)).toBe('correct horse battery');
  });
});

describe('AuthDtoMapper.toLoginRequest', () => {
  it('should_build_the_username_and_the_attempt_when_the_sign_in_body_is_valid', () => {
    const request = AuthDtoMapper.toLoginRequest({
      username: 'Ada',
      password: 'correct horse battery',
    });

    if (!request.ok) {
      throw new Error('The mapper must build the request.');
    }
    expect(request.value.username.equals(valueOf(Username.create('Ada')))).toBe(true);
    expect(receiveValueOf(request.value.attempt)).toBe('correct horse battery');
  });

  // An attempt has no length rule: a wrong password can be shorter than any
  // Password. A text longer than any password still becomes an attempt, and
  // LoginUseCase asks isLongerThanAnyPassword() before any hash work.
  it.each(['short', '', 'x'.repeat(129), EMOJI.repeat(129)])(
    'should_build_the_attempt_as_typed_when_the_sign_in_password_has_any_length',
    (typed) => {
      const request = AuthDtoMapper.toLoginRequest({ username: 'ada', password: typed });

      if (!request.ok) {
        throw new Error('The mapper must build the request.');
      }
      expect(receiveValueOf(request.value.attempt)).toBe(typed);
    },
  );

  it.each(BROKEN_SHAPES)(
    'should_fail_with_the_shape_problem_of_each_field_when_a_sign_in_field_is_missing_or_not_a_string',
    (body, problems) => {
      expect(AuthDtoMapper.toLoginRequest(body)).toEqual({
        ok: false,
        error: { kind: 'invalid-body', problems },
      });
    },
  );

  // No stored user has a name that breaks the rule. So the mapper stops the
  // request with the failure of a wrong password, and sign-in keeps one way
  // to fail for bad credentials.
  it.each(BROKEN_USERNAMES)(
    'should_fail_with_invalid_credentials_when_the_sign_in_username_breaks_its_rule',
    (username) => {
      expect(AuthDtoMapper.toLoginRequest({ username, password: 'correct horse battery' })).toEqual(
        { ok: false, error: { kind: 'invalid-credentials' } },
      );
      expect(AuthDtoMapper.toLoginRequest({ username, password: 'x'.repeat(129) })).toEqual({
        ok: false,
        error: { kind: 'invalid-credentials' },
      });
    },
  );
});

describe('AuthDtoMapper answers', () => {
  it('should_put_the_session_token_in_access_token_when_sign_in_succeeds', () => {
    expect(AuthDtoMapper.toTokenDto('signed.jwt.token')).toEqual({
      accessToken: 'signed.jwt.token',
    });
  });

  it('should_give_the_user_id_that_the_token_names_when_the_user_is_signed_in', () => {
    const userId = valueOf(UserId.from(testUserId(1)));

    expect(AuthDtoMapper.toCurrentUserDto(userId)).toEqual({ userId: testUserId(1) });
  });

  // A UserId delivers the lower case form of its UUID.
  it('should_give_the_lower_case_form_when_the_user_id_has_capital_letters', () => {
    const userId = valueOf(UserId.from('6F1C1D0E-2B7A-4C55-9A51-0D6C7A1E8F01'));

    expect(AuthDtoMapper.toCurrentUserDto(userId)).toEqual({
      userId: '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01',
    });
  });
});
