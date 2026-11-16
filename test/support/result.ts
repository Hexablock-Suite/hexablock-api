import type { Result } from '../../src/domain/shared/result.js';

// The value of a successful Result. A failed Result throws, so the test
// that expects a value fails with the problem in its message. Every factory
// of a value object returns a Result (decision 11), so a test builds its
// values through this function.
export function valueOf<T>(result: Result<T, unknown>): T {
  if (!result.ok) {
    throw new Error(`Expected a value, got the problem ${String(result.error)}.`);
  }
  return result.value;
}
