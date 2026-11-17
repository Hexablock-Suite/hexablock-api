import type { LevelResult } from '../../domain/progress/level-result.js';
import type { Stars } from '../../domain/progress/stars.js';

// The expected failures of the progress use cases. A controller turns each
// one into the ErrorDto body (decision 11). A value that breaks its rule
// stops at its factory: the mapper of the border builds the values of a
// request, so no broken value reaches a use case.
// - progress-not-found: the user has no progress for the gameId.
// - unknown-user: the user of the token goes between the guard and the
//   write of a sync (#137).
// - unknown-level: the API holds no valid level of a synced result: no row,
//   a row of another game, or a row that breaks a rule (#147). It carries
//   the result, so the border names its levelId (#135).
// - too-many-stars: a synced result carries more stars than its level has
//   star thresholds (DS-6, #135). It carries the result and the most stars
//   of its level, so the border writes both.
export type ProgressProblem =
  | { readonly kind: 'progress-not-found' }
  | { readonly kind: 'unknown-user' }
  | { readonly kind: 'unknown-level'; readonly result: LevelResult }
  | { readonly kind: 'too-many-stars'; readonly result: LevelResult; readonly most: Stars };
