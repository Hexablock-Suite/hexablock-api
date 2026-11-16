import type { Result } from '../../domain/shared/result.js';

// The value of a stored row. The factory of a value object returns a failed
// Result for a value that breaks its rule (decision 11). A stored value that
// breaks a rule of the domain is a server fault, so this function throws.
// The message names the rows and the code of the rule. HttpErrorFilter
// answers 500 and shows no part of it.
export function storedValue<T>(result: Result<T, string>, rows: string): T {
  if (!result.ok) {
    throw new Error(`${rows} break the rule ${result.error}.`);
  }
  return result.value;
}
