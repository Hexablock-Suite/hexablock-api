import type { LevelResultValues } from '../../src/adapters/received.js';
import { ElapsedTime } from '../../src/domain/progress/elapsed-time.js';
import { LevelId } from '../../src/domain/progress/level-id.js';
import { LevelResult } from '../../src/domain/progress/level-result.js';
import { Moves } from '../../src/domain/progress/moves.js';
import { Stars } from '../../src/domain/progress/stars.js';

// Builds a LevelResult from plain values, as a mapper of the border does. A
// test names the values as text and numbers. Each value object checks its
// own rule.
export function levelResultOf({
  levelId,
  stars,
  moves,
  elapsedMs,
}: LevelResultValues): LevelResult {
  return LevelResult.of(
    LevelId.of(levelId),
    Stars.of(stars),
    Moves.of(moves),
    ElapsedTime.ofMs(elapsedMs),
  );
}
