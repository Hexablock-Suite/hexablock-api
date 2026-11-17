// Postgres code 23505 is unique_violation.
export const UNIQUE_VIOLATION = '23505';
// Postgres code 23503 is foreign_key_violation.
export const FOREIGN_KEY_VIOLATION = '23503';

// Tells if the error, or an error in its cause chain, carries the Postgres
// code. Drizzle wraps the driver error in its own error and keeps the
// driver error as the cause.
export function hasSqlState(error: unknown, code: string): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { code?: unknown }).code === code) {
      return true;
    }
  }
  return false;
}
