import { err, ok, type Result } from '../shared/result.js';
import type { LevelProblem } from './level-problem.js';

// Reads one part of the raw section of a level. It gives the part as a
// domain value, or the level problem of the rule that the raw part breaks.
export type PartReader<T> = (raw: unknown) => Result<T, LevelProblem>;

// One reader for each field of a raw object. The keys of the readers are the
// only fields that the object may have.
export type FieldReaders<T> = { readonly [K in keyof T]: PartReader<T[K]> };

// Reads a raw object that has exactly the fields of `readers`. A raw value
// that is not a plain object, or an object with another field, gives
// `problem`. A field that its reader rejects gives the problem of that
// reader. The readers run in their order, so the first broken field decides.
// A missing field reaches its reader as undefined.
export function readFields<T>(
  raw: unknown,
  readers: FieldReaders<T>,
  problem: LevelProblem,
): Result<T, LevelProblem> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return err(problem);
  }
  const names = Object.keys(readers) as (keyof T & string)[];
  if (Object.keys(raw).some((name) => !(names as string[]).includes(name))) {
    return err(problem);
  }
  const fields = raw as Readonly<Record<PropertyKey, unknown>>;
  const read: Partial<T> = {};
  for (const name of names) {
    const part = readers[name](Object.hasOwn(fields, name) ? fields[name] : undefined);
    if (!part.ok) {
      return part;
    }
    read[name] = part.value;
  }
  return ok(read as T);
}

// Reads a raw list with one item or more. A raw value that is not a list, an
// empty list, or a list with an item that `readItem` rejects gives `problem`.
// The list that it gives is frozen.
export function readList<T>(
  raw: unknown,
  readItem: PartReader<T>,
  problem: LevelProblem,
): Result<readonly T[], LevelProblem> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return err(problem);
  }
  const items: T[] = [];
  for (const rawItem of raw as unknown[]) {
    const item = readItem(rawItem);
    if (!item.ok) {
      return err(problem);
    }
    items.push(item.value);
  }
  return ok(Object.freeze(items));
}

// Tells if two lists hold equal items in the same order.
export function sameItems<T>(
  left: readonly T[],
  right: readonly T[],
  same: (leftItem: T, rightItem: T) => boolean,
): boolean {
  return left.length === right.length && left.every((item, index) => same(item, right[index]));
}
