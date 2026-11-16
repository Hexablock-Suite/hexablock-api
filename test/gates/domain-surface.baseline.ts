// The sites of src/domain that break the domain surface rule today (#102).
// One entry names one site: the file, the member and the kind of the break.
// A task that fixes a site removes its entry. Never add an entry: a new site
// is a regression. The gate fails when an entry names a site that the code no
// longer has, so the list only shrinks. Each comment names the issue that
// removes the entries below it.
export const DOMAIN_SURFACE_BASELINE: readonly string[] = [
  // #99: the number order of Range and the Range<number> of the credential limits.
  'src/domain/shared/range.ts Compare() return',
  'src/domain/shared/range.ts Range.ofNumbers() return',
  'src/domain/user/password.ts PASSWORD_LENGTH constant',
  'src/domain/user/username.ts USERNAME_LENGTH constant',
  'src/domain/user/username.ts USERNAME_PATTERN constant',
  // #98: the typed password text.
  'src/domain/user/password.ts Password.isTooLong(raw) parameter',
  'src/domain/user/password-verifier.ts PasswordVerifier.verify(typed) parameter',
  'src/domain/user/user.ts User.passwordMatches(typed) parameter',
];
