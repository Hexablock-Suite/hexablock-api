import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LevelDefinition } from '../../src/domain/level/level-definition.js';
import { LevelOrder } from '../../src/domain/level/level-order.js';
import type { LevelProblem } from '../../src/domain/level/level-problem.js';
import { LevelVersion } from '../../src/domain/level/level-version.js';
import { TopologyId } from '../../src/domain/level/topology-id.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { LevelId } from '../../src/domain/progress/level-id.js';
import type { Result } from '../../src/domain/shared/result.js';

// The shared level format of S3-02. Its complete examples are the fixtures
// of the level tests (#77, #78, #79), so the document and the code cannot drift.
export const LEVEL_FORMAT = 'docs/level-format.md';

// One level as the format writes it. The section stays raw: the section type reads it.
export interface LevelJson {
  gameId: string;
  levelId: string;
  order: number;
  version: number;
  topology: string;
  section: Record<string, unknown>;
}

const ROOT = resolve(import.meta.dirname, '../..');
const FENCED_JSON = /```json\n([\s\S]*?)```/g;

// Every JSON block of the format document, parsed, in the order of the document.
export function jsonBlocksOfFormat(): unknown[] {
  const markdown = readFileSync(resolve(ROOT, LEVEL_FORMAT), 'utf8');
  return [...markdown.matchAll(FENCED_JSON)].map((match) => JSON.parse(match[1]) as unknown);
}

// The complete example of a game in the format document. A complete example
// is a block with a gameId. Each call parses the document again, so a test
// can change its copy.
export function levelExample(gameId: 'fit' | 'sort'): LevelJson {
  const examples = jsonBlocksOfFormat().filter(
    (block): block is LevelJson =>
      typeof block === 'object' && block !== null && (block as LevelJson).gameId === gameId,
  );
  if (examples.length !== 1) {
    throw new Error(
      `${LEVEL_FORMAT} must hold one complete ${gameId} example, not ${examples.length}.`,
    );
  }
  return examples[0];
}

// Builds a level as the border does: the domain values of the common part
// from the JSON, and the section through `sectionOf`. The first broken value
// stops the build.
export function levelFrom<TSection>(
  json: LevelJson,
  sectionOf: (raw: unknown) => Result<TSection, LevelProblem>,
): Result<LevelDefinition<TSection>, LevelProblem> {
  const order = LevelOrder.of(json.order);
  if (!order.ok) return order;
  const version = LevelVersion.of(json.version);
  if (!version.ok) return version;
  const topology = TopologyId.of(json.topology);
  if (!topology.ok) return topology;
  return LevelDefinition.of(
    GameId.of(json.gameId),
    LevelId.of(json.levelId),
    order.value,
    version.value,
    topology.value,
    sectionOf(json.section),
  );
}

// The value of a successful Result. A failed Result throws, so the test
// that expects a value fails with the problem in its message.
export function valueOf<T>(result: Result<T, unknown>): T {
  if (!result.ok) {
    throw new Error(`Expected a value, got the problem ${String(result.error)}.`);
  }
  return result.value;
}
