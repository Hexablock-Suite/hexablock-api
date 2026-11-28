// The problem of an account outside the list of level editors (#145).
// AuthorizationAspect gives it before UpdateLevels runs (#180). It carries a
// kind, so LoggingAspect can log it, and no user id.
export type NotALevelEditor = { readonly kind: 'not-a-level-editor' };
