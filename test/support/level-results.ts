import { buildLevelResult } from '../../src/adapters/built.js';
import type { LevelResultValues } from '../../src/adapters/received.js';
import type { LevelResult } from '../../src/domain/progress/level-result.js';
import { valueOf } from './result.js';

// Builds a LevelResult from plain values, as a mapper of the border does. A
// test names the values as text and numbers. Each value object checks its
// own rule, and a broken rule throws here.
export function levelResultOf(values: LevelResultValues): LevelResult {
  return valueOf(buildLevelResult(values));
}
