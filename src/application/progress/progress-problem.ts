import { ProgressError } from '../../domain/progress/progress-error.js';
import { err, ok, type Result } from '../../domain/shared/result.js';

// The expected failures of the progress use cases. A controller turns each
// one into the ErrorDto body (decision 11).
export type ProgressProblem =
  | { readonly kind: 'invalid-progress'; readonly problems: string[] }
  | { readonly kind: 'progress-not-found' };

// Runs a step that builds or changes domain values. A broken domain rule
// becomes a failed Result, so no domain error crosses the input port.
export function withProgressRules<T>(step: () => T): Result<T, ProgressProblem> {
  try {
    return ok(step());
  } catch (error) {
    if (error instanceof ProgressError) {
      return err({ kind: 'invalid-progress', problems: [error.message] });
    }
    throw error;
  }
}
