import { RegisterTestApi } from '../../support/testing-api/register.test-api.js';

// One code point, two UTF-16 units.
const EMOJI = '\u{1F600}';

describe('RegisterUseCase', () => {
  let register: RegisterTestApi;

  beforeEach(() => {
    register = new RegisterTestApi();
  });

  it('should_store_hashed_password_when_user_registers', async () => {
    await register.whenRegistering('ada', 'correct horse');

    register.thenTheRegistrationGivesTheIdOfUser(1);
    register.thenTheStoredAccountsAre([{ user: 1, username: 'ada', password: 'correct horse' }]);
  });

  // #90: the port carries domain types, so the use case reads no text.
  it('should_pass_a_password_to_the_hasher_and_store_its_password_hash_when_user_registers', async () => {
    await register.whenRegistering('ada', 'correct horse');

    register.thenTheHasherGotThePasswordAndTheStoreKeepsItsHash('correct horse');
  });

  it('should_fail_with_username_taken_when_username_exists', async () => {
    register.givenARegisteredUser('ada', 'correct horse');

    await register.whenRegistering('ada', 'other password');

    register.thenTheRegistrationFailsWithUsernameTaken();
    register.thenTheStoredAccountsAre([{ user: 1, username: 'ada', password: 'correct horse' }]);
  });

  // The name is stored as typed, but a name that differs only in letter
  // case from a stored one is taken (#62).
  it('should_fail_with_username_taken_when_username_differs_only_in_case', async () => {
    register.givenARegisteredUser('ada', 'correct horse');

    await register.whenRegistering('Ada', 'other password');

    register.thenTheRegistrationFailsWithUsernameTaken();
    register.thenTheStoredAccountsAre([{ user: 1, username: 'ada', password: 'correct horse' }]);
  });

  it('should_store_username_as_typed_when_it_has_capital_letters', async () => {
    await register.whenRegistering('AdaLovelace', 'correct horse');

    register.thenTheRegistrationGivesTheIdOfUser(1);
    register.thenTheStoredUsernamesAre(['AdaLovelace']);
  });

  // #105: AuthDtoMapper builds the Username and the Password, so a value that
  // breaks its rule never reaches the use case. The use case passes the
  // values of the request to its ports and to the new User, and builds no
  // value from a request field.
  it('should_pass_the_username_and_the_password_of_the_request_to_the_ports_when_user_registers', async () => {
    await register.whenRegistering('ada', 'correct horse');

    register.thenTheRegistrationGivesTheIdOfUser(1);
    register.thenThePortsAndTheUserGotTheValuesOfTheRequest();
  });

  // The lookup runs before the hash, so a taken username costs no hash work.
  it('should_not_hash_password_when_username_is_taken', async () => {
    register.givenARegisteredUser('ada', 'correct horse');

    await register.whenRegistering('ada', 'other password');

    register.thenTheRegistrationFailsWithUsernameTaken();
    register.thenNoPasswordWasHashed();
    register.thenTheStoreHoldsAccounts(1);
  });

  // The lookup ignores letter case, so it finds `ada` before the hash runs.
  it('should_not_hash_password_when_username_differs_only_in_case', async () => {
    register.givenARegisteredUser('ada', 'correct horse');

    await register.whenRegistering('Ada', 'other password');

    register.thenTheRegistrationFailsWithUsernameTaken();
    register.thenNoPasswordWasHashed();
    register.thenTheStoreHoldsAccounts(1);
  });

  // The credential rules of sign-up (API-FR-01): a username has 3 to 32
  // letters, digits, dots, hyphens or underscores, and a password has 8 to
  // 128 characters. A character is one code point, so an emoji counts once
  // (#60). Each row sits at a limit of a rule.
  it.each([
    ['abc', '12345678'],
    ['a'.repeat(32), 'x'.repeat(128)],
    ['grace.hopper', EMOJI.repeat(8)],
    ['Player_01-x', EMOJI.repeat(128)],
  ])(
    'should_store_the_account_when_the_username_and_the_password_follow_their_rules',
    async (username, password) => {
      await register.whenRegistering(username, password);

      register.thenTheRegistrationGivesTheIdOfUser(1);
      register.thenTheStoredAccountsAre([{ user: 1, username, password }]);
    },
  );

  // A value that breaks its rule stops at the border, so the use case never
  // runs. #100: the lower case of a letter outside ASCII, such as İ or ẞ, can
  // differ between JavaScript and a database, so the rule rejects it.
  it.each(['ab', 'a'.repeat(33), '', 'ada lovelace', 'ada!', `ad${EMOJI}`, 'İlker', 'STRAẞE'])(
    'should_refuse_the_registration_with_invalid_username_when_the_username_breaks_its_rule',
    async (username) => {
      await register.whenRegistering(username, 'correct horse');

      register.thenTheRegistrationIsRefusedWith('invalid-username');
      register.thenNoPasswordWasHashed();
      register.thenTheStoreHoldsAccounts(0);
    },
  );

  // The length counts code points, not UTF-16 units: four emoji are eight
  // UTF-16 units and four characters.
  it.each(['', '1234567', 'x'.repeat(129), EMOJI.repeat(4), EMOJI.repeat(129)])(
    'should_refuse_the_registration_with_invalid_password_when_the_password_has_fewer_than_8_or_more_than_128_characters',
    async (password) => {
      await register.whenRegistering('ada', password);

      register.thenTheRegistrationIsRefusedWith('invalid-password');
      register.thenNoPasswordWasHashed();
      register.thenTheStoreHoldsAccounts(0);
    },
  );

  // An unexpected failure is not a RegisterProblem. HttpErrorFilter turns it into a 500.
  it('should_reject_without_storing_user_when_password_hasher_fails', async () => {
    register.givenTheHasherFails();

    await register.whenRegistering('ada', 'correct horse');

    register.thenTheRegistrationRejectsWithTheHasherFailure();
    register.thenTheStoreHoldsAccounts(0);
  });
});
