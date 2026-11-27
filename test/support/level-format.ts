import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FitLevelValidator } from '../../src/domain/level/fit/fit-level-validator.js';
import { HexTopology } from '../../src/domain/level/hex-topology.js';
import { LevelDefinition } from '../../src/domain/level/level-definition.js';
import { LevelOrder } from '../../src/domain/level/level-order.js';
import type { LevelProblem } from '../../src/domain/level/level-problem.js';
import type { LevelSection } from '../../src/domain/level/level-section.js';
import { LevelValidators } from '../../src/domain/level/level-validators.js';
import { LevelVersion } from '../../src/domain/level/level-version.js';
import { SortLevelValidator } from '../../src/domain/level/sort/sort-level-validator.js';
import { SquareTopology } from '../../src/domain/level/square-topology.js';
import { Topologies } from '../../src/domain/level/topologies.js';
import { TopologyId } from '../../src/domain/level/topology-id.js';
import { TriangleTopology } from '../../src/domain/level/triangle-topology.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { LevelId } from '../../src/domain/progress/level-id.js';
import { Stars } from '../../src/domain/progress/stars.js';
import type { Result } from '../../src/domain/shared/result.js';
import { valueOf } from './result.js';

// The level tests import valueOf from here since #77.
export { valueOf };

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
export function levelExample(gameId: 'hexa-fit' | 'hexa-sort'): LevelJson {
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

// A section for a test that needs a level and no real section: a name, so
// two sections differ, and the count of its star thresholds (DS-6).
export function testSection(name: string, stars = 3): LevelSection & { readonly name: string } {
  const most = valueOf(Stars.of(stars));
  return { name, mostStars: () => most };
}

// Builds a level as the border does: the domain values of the common part
// from the JSON, and the section through `sectionOf`. The first broken value
// stops the build.
export function levelFrom<TSection extends LevelSection>(
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
    valueOf(GameId.of(json.gameId)),
    valueOf(LevelId.of(json.levelId)),
    order.value,
    version.value,
    topology.value,
    sectionOf(json.section),
  );
}

// The strategies as the composition root registers them: Fit on the hex,
// square and triangle topologies, and Sort.
export function levelValidators(): LevelValidators {
  const topologies = Topologies.of([
    [valueOf(TopologyId.of('hex')), new HexTopology()],
    [valueOf(TopologyId.of('square')), new SquareTopology()],
    [valueOf(TopologyId.of('triangle')), new TriangleTopology()],
  ]);
  return LevelValidators.of([
    [valueOf(GameId.of('hexa-fit')), new FitLevelValidator(topologies)],
    [valueOf(GameId.of('hexa-sort')), new SortLevelValidator()],
  ]);
}

// A level of the format document with its own levelId and version, so a
// test names only the values that it needs. The levelId of the example,
// fit-01 or sort-01, is the default.
export function levelJson(
  gameId: 'hexa-fit' | 'hexa-sort',
  levelId?: string,
  version = 1,
): LevelJson {
  const example = levelExample(gameId);
  return { ...example, levelId: levelId ?? example.levelId, version };
}

// Builds a level as the border does: the common part as domain values and
// the section through the strategy of its game. A broken value throws.
export function checkedLevel(
  json: LevelJson,
  validators: LevelValidators = levelValidators(),
): LevelDefinition<unknown> {
  return valueOf(
    validators.check(
      valueOf(GameId.of(json.gameId)),
      valueOf(LevelId.of(json.levelId)),
      valueOf(LevelOrder.of(json.order)),
      valueOf(LevelVersion.of(json.version)),
      valueOf(TopologyId.of(json.topology)),
      json.section,
    ),
  );
}
