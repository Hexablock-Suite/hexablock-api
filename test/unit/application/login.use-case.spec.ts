import { LoginTestApi } from '../../support/testing-api/login.test-api.js';

// One code point, two UTF-16 units.
const EMOJI = '\u{1F600}';

describe('LoginUseCase', () => {
  let login: LoginTestApi;

  beforeEach(() => {
    login = new LoginTestApi().givenARegisteredUser('ada', 'correct horse');
  });

  it('should_return_token_for_user_when_credentials_are_valid', async () => {
    await login.whenSigningIn('ada', 'correct horse');

    login.thenTheSignInGivesTheTokenOfUser(1);
  });

  it('should_fail_with_invalid_credentials_when_password_is_wrong', async () => {
    await login.whenSigningIn('ada', 'wrong horse');

    login.thenTheSignInFailsWithInvalidCredentials();
  });

  it('should_fail_with_invalid_credentials_when_username_is_unknown', async () => {
    await login.whenSigningIn('grace', 'correct horse');

    login.thenTheSignInFailsWithInvalidCredentials();
  });

  // Login finds the user by the lower-case key that sign-up uses (#144).
  it.each(['ADA', 'Ada'])(
    'should_return_token_for_user_when_username_differs_only_in_case',
    async (typed) => {
      await login.whenSigningIn(typed, 'correct horse');

      login.thenTheSignInGivesTheTokenOfUser(1);
    },
  );

  it('should_fail_with_invalid_credentials_when_username_differs_only_in_case_and_password_is_wrong', async () => {
    await login.whenSigningIn('ADA', 'wrong horse');

    login.thenTheSignInFailsWithInvalidCredentials();
  });

  // The security rule of the dummy hash: an unknown username costs the
  // same one hash check as a wrong password, so the answer time does not
  // tell which usernames exist.
  it('should_verify_password_once_against_dummy_hash_when_username_is_unknown', async () => {
    await login.whenSigningIn('grace', 'correct horse');

    login.thenTheSignInFailsWithInvalidCredentials();
    login.thenThePasswordWasCheckedOnceAgainstTheDummyHash('correct horse');
  });

  // The typed text can be shorter than any Password. The unknown username
  // still costs one check, against the hash that the constructor started.
  it('should_verify_the_short_typed_text_once_against_the_started_dummy_hash_when_username_is_unknown', async () => {
    const empty = new LoginTestApi();

    await empty.whenSigningIn('nobody', 'short');

    empty.thenTheSignInFailsWithInvalidCredentials();
    empty.thenTheAttemptWasCheckedOnceAgainstTheStartedDummyHash('short');
  });

  // An unknown username costs one hash check, as a wrong password does, and
  // no hash: the constructor started the dummy hash.
  it('should_not_hash_during_login_when_first_unknown_username_signs_in', async () => {
    await login.whenSigningIn('grace', 'correct horse');

    login.thenTheSignInFailsWithInvalidCredentials();
    login.thenNoPasswordWasHashedDuringTheSignIn();
  });

  // The constructor starts the dummy hash. Its failure is not an unhandled
  // rejection, and the first unknown username still gets the failure.
  it('should_reject_unknown_username_login_with_hash_failure_when_dummy_hash_fails_early', async () => {
    const early = new LoginTestApi().givenTheHasherFailsEveryHash();

    await early.whenTheUseCaseIsBuilt();

    early.thenNoRejectionWasUnhandled();

    await early.whenSigningIn('grace', 'correct horse');

    early.thenTheSignInRejectsWithTheHasherFailure();
  });

  // The maximum bounds the hash work of one request (#60).
  it.each(['x'.repeat(129), EMOJI.repeat(129)])(
    'should_fail_with_invalid_credentials_without_hashing_when_password_has_more_than_128_characters',
    async (password) => {
      await login.whenSigningIn('ada', password);

      login.thenTheSignInFailsWithInvalidCredentials();
      login.thenNoPasswordWasCheckedOrHashed();
    },
  );

  it.each(['x'.repeat(128), EMOJI.repeat(128)])(
    'should_verify_password_when_it_has_128_code_points',
    async (password) => {
      await login.whenSigningIn('ada', password);

      login.thenThePasswordWasCheckedOnce();
    },
  );

  it('should_verify_password_once_when_password_is_wrong', async () => {
    await login.whenSigningIn('ada', 'wrong horse');

    login.thenTheSignInFailsWithInvalidCredentials();
    login.thenThePasswordWasCheckedOnceAgainstTheStoredHashOf('wrong horse', 'correct horse');
  });

  // #90: the port carries domain types, so the use case reads no text.
  // #98: the typed text reaches the port as a PasswordAttempt.
  it('should_pass_the_typed_text_and_the_stored_password_hash_to_the_hasher_when_user_signs_in', async () => {
    await login.whenSigningIn('ada', 'correct horse');

    login.thenTheHasherGotTheTypedTextAsAnAttemptAndAStoredHash('correct horse');
  });

  it('should_hash_the_dummy_password_as_a_password_when_the_use_case_is_built', async () => {
    const built = new LoginTestApi();

    await built.whenTheUseCaseIsBuilt();

    built.thenTheUseCaseHashedOneDummyPassword();
  });

  // The trap of #90: a wrong password can be shorter than any Password, and
  // it still costs one hash check. So verify() takes a PasswordAttempt, which
  // has no length rule (#98).
  it('should_verify_the_typed_text_once_when_it_is_shorter_than_any_password', async () => {
    await login.whenSigningIn('ada', 'short');

    login.thenTheSignInFailsWithInvalidCredentials();
    login.thenThePasswordWasCheckedOnceAgainstTheStoredHashOf('short', 'correct horse');
  });

  // #91: the token issuer takes the user. #98: no test spies on the user. The
  // check of the stored hash through the port shows that the user checks
  // the typed text.
  it('should_pass_the_found_user_to_the_token_issuer_when_credentials_are_valid', async () => {
    await login.whenSigningIn('ada', 'correct horse');

    login.thenTheSignInGivesTheTokenOfUser(1);
    login.thenTheTokenIssuerGotTheStoredUserOnce();
  });

  it('should_verify_password_once_when_credentials_are_valid', async () => {
    await login.whenSigningIn('ada', 'correct horse');

    login.thenTheSignInGivesTheTokenOfUser(1);
    login.thenThePasswordWasCheckedOnceAgainstTheStoredHashOf('correct horse', 'correct horse');
  });

  it('should_issue_no_token_when_the_password_is_wrong_or_the_username_is_unknown', async () => {
    await login.whenSigningIn('ada', 'wrong horse');
    await login.whenSigningIn('grace', 'correct horse');

    login.thenNoTokenWasIssued();
  });

  // The probes of the independent check of #91.
  // The maximum bounds the hash work for an unknown username too.
  it('should_skip_the_hash_check_when_an_unknown_username_sends_a_password_above_the_maximum', async () => {
    await login.whenSigningIn('grace', 'y'.repeat(129));

    login.thenTheSignInFailsWithInvalidCredentials();
    login.thenNoPasswordWasChecked();
  });

  // A failure of the hasher is not a wrong password. The sign-in rejects with it.
  it('should_reject_with_the_failure_of_the_hasher_when_the_check_of_a_found_user_fails', async () => {
    login.givenTheHasherFailsEveryCheck();

    await login.whenSigningIn('ada', 'correct horse');

    login.thenTheSignInRejectsWithTheHasherFailure();
  });

  // #105: AuthDtoMapper builds the Username and the PasswordAttempt. The use
  // case passes the values of the request to its ports and builds no value
  // from a request field. A username that breaks its rule stops in the
  // mapper, so it never reaches the use case.
  it('should_pass_the_username_and_the_attempt_of_the_request_to_the_ports_when_user_signs_in', async () => {
    await login.whenSigningIn('ada', 'correct horse');

    login.thenTheSignInGivesTheTokenOfUser(1);
    login.thenThePortsGotTheUsernameAndTheAttemptOfTheRequest();
  });

  // The use case asks the attempt of the request before any port call. So a
  // text longer than any password costs no lookup and no hash work.
  it('should_call_no_port_when_the_attempt_of_the_request_is_longer_than_any_password', async () => {
    await login.whenSigningIn('ada', 'x'.repeat(129));

    login.thenTheSignInFailsWithInvalidCredentials();
    login.thenNoPortWasCalled();
  });
});
