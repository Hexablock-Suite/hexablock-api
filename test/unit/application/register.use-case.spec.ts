import { RegisterTestApi } from '../../support/testing-api/register.test-api.js';

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

  // An unexpected failure is not a RegisterProblem. HttpErrorFilter turns it into a 500.
  it('should_reject_without_storing_user_when_password_hasher_fails', async () => {
    register.givenTheHasherFails();

    await register.whenRegistering('ada', 'correct horse');

    register.thenTheRegistrationRejectsWithTheHasherFailure();
    register.thenTheStoreHoldsAccounts(0);
  });
});
