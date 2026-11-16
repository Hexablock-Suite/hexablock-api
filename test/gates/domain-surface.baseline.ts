// The sites of src/domain that break the domain surface rule today (#102).
// One entry names one site: the file, the member and the kind of the break.
// A task that fixes a site removes its entry. Never add an entry: a new site
// is a regression. The gate fails when an entry names a site that the code no
// longer has, so the list only shrinks. Each comment names the issue that
// removes the entries below it.
export const DOMAIN_SURFACE_BASELINE: readonly string[] = [
  // #95: the public fields of LevelResultValues and LevelResult.
  'src/domain/progress/level-result.ts LevelResultValues.levelId field',
  'src/domain/progress/level-result.ts LevelResultValues.stars field',
  'src/domain/progress/level-result.ts LevelResultValues.moves field',
  'src/domain/progress/level-result.ts LevelResultValues.elapsedMs field',
  'src/domain/progress/level-result.ts LevelResult.levelId field',
  'src/domain/progress/level-result.ts LevelResult.stars field',
  'src/domain/progress/level-result.ts LevelResult.moves field',
  'src/domain/progress/level-result.ts LevelResult.elapsedTime field',
  // #96: the public fields of PlayerProgressState.
  'src/domain/progress/player-progress.ts PlayerProgressState.userId field',
  'src/domain/progress/player-progress.ts PlayerProgressState.gameId field',
  'src/domain/progress/player-progress.ts PlayerProgressState.highScore field',
  'src/domain/progress/player-progress.ts PlayerProgressState.updatedAt field',
  'src/domain/progress/player-progress.ts PlayerProgressState.results field',
  // #97: the Date parameters of PlayerProgress.
  'src/domain/progress/player-progress.ts PlayerProgress.start(at) parameter',
  'src/domain/progress/player-progress.ts PlayerProgress.recordScore(at) parameter',
  // #103: the message text of ProgressError.
  'src/domain/progress/progress-error.ts ProgressError.constructor(message) parameter',
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
  // #96: the public fields of UserState.
  'src/domain/user/user.ts UserState.id field',
  'src/domain/user/user.ts UserState.username field',
  'src/domain/user/user.ts UserState.passwordHash field',
];
