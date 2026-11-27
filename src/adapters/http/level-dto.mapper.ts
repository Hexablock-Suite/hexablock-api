import type { LevelProblemReport } from '../../application/levels/invalid-levels.js';
import type { ListedLevels } from '../../application/levels/listed-levels.js';
import type {
  IncomingLevel,
  UpdateLevelsRequest,
} from '../../application/levels/update-levels.use-case.js';
import type { LevelDefinition } from '../../domain/level/level-definition.js';
import { LevelOrder } from '../../domain/level/level-order.js';
import { LevelVersion } from '../../domain/level/level-version.js';
import { TopologyId } from '../../domain/level/topology-id.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import { receiveJsonOf, receiveValueOf } from '../received.js';
import type { LevelDto, LevelsDto } from './level.dto.js';
import { gameIdFrom, levelIdFrom } from './progress-values.js';

const SHAPE_PROBLEM = 'levels must be an array of objects';

// A level of docs/level-format.md holds exactly these fields.
const LEVEL_FIELDS = ['gameId', 'levelId', 'order', 'version', 'topology', 'section'];
const FIELDS_PROBLEM =
  'a level holds exactly the fields gameId, levelId, order, version, topology and section';

// Translates between LevelDto and LevelDefinition (decision 12). The
// controller holds no translation code. The mapper builds the values of the
// common part of each level, so the use case gets them built. It keeps the
// section as it arrives: only the strategy of the gameId knows the section
// type, and a mapper never picks one (#77, decision 5). Each problem names
// its level by its gameId and levelId, so a client can show it.
export const LevelDtoMapper = {
  // The app has no validation pipe, so the mapper checks the body shape.
  // The domain checks the rule of each value. A level that breaks a rule
  // gives one problem, and the mapper checks every level of the body.
  toRequest(body: unknown): Result<UpdateLevelsRequest, string[]> {
    const levels = isObject(body) ? body.levels : undefined;
    if (!Array.isArray(levels) || !levels.every(isObject)) {
      return err([SHAPE_PROBLEM]);
    }
    const built: IncomingLevel[] = [];
    const problems: string[] = [];
    levels.forEach((level, index) => {
      const incoming = incomingLevel(level, index);
      if (incoming.ok) {
        built.push(incoming.value);
      } else {
        problems.push(incoming.error);
      }
    });
    return problems.length === 0 ? ok({ levels: built }) : err(problems);
  },

  // The level delivers its parts in the fields of the shared level format.
  // receiveJsonOf() gives the JSON of the section, so the mapper names no
  // section type.
  toDto(level: LevelDefinition<unknown>): LevelDto {
    const { gameId, levelId, order, version, topology, section } = receiveValueOf(level);
    return {
      gameId: receiveValueOf(gameId),
      levelId: receiveValueOf(levelId),
      order: receiveValueOf(order),
      version: receiveValueOf(version),
      topology: receiveValueOf(topology),
      section: receiveJsonOf(section) as unknown as LevelDto['section'],
    };
  },

  // The answer of the read. It gives unavailable only when a stored level
  // breaks a rule, so an answer with no broken level keeps its old shape
  // (#147). The key of a broken level is the text of its row.
  toLevelsDto({ levels, unavailable }: ListedLevels): LevelsDto {
    const dto = { levels: levels.map((level) => LevelDtoMapper.toDto(level)) };
    if (unavailable.length === 0) {
      return dto;
    }
    return {
      ...dto,
      unavailable: unavailable.map(({ gameId, levelId, reason }) => ({ gameId, levelId, reason })),
    };
  },

  // The details of the ErrorDto of a failed update: one line per problem.
  // The code of the rule is the text that docs/level-format.md names.
  toDetails(problems: readonly LevelProblemReport[]): string[] {
    return problems.map(
      ({ gameId, levelId, problem }) =>
        `${nameOf(receiveValueOf(gameId), receiveValueOf(levelId))}: ${problem}`,
    );
  },
};

// Builds the values of one level in the order of the format: the gameId,
// the levelId, the set of fields, the order, the version and the topology.
// The first broken rule gives the problem of the level. A level with no
// valid gameId or levelId has no name, so its problem names its place.
function incomingLevel(
  level: Record<string, unknown>,
  index: number,
): Result<IncomingLevel, string> {
  // Each factory checks the type and the rule of its value, and
  // progress-values.ts writes the text of a broken rule.
  const gameId = gameIdFrom(level.gameId);
  if (!gameId.ok) return err(`levels[${index}]: ${gameId.error}`);
  const levelId = levelIdFrom(level.levelId);
  if (!levelId.ok) return err(`levels[${index}]: ${levelId.error}`);
  const name = nameOf(level.gameId as string, level.levelId as string);
  if (!hasLevelFields(level)) {
    return err(`${name}: ${FIELDS_PROBLEM}`);
  }
  // Each factory checks the type and the rule of its value.
  const order = LevelOrder.of(level.order as number);
  if (!order.ok) return err(`${name}: ${order.error}`);
  const version = LevelVersion.of(level.version as number);
  if (!version.ok) return err(`${name}: ${version.error}`);
  const topology = TopologyId.of(level.topology as string);
  if (!topology.ok) return err(`${name}: ${topology.error}`);
  return ok({
    gameId: gameId.value,
    levelId: levelId.value,
    order: order.value,
    version: version.value,
    topology: topology.value,
    section: level.section,
  });
}

// JSON quotes keep the two values apart, whatever characters they hold.
function nameOf(gameId: string, levelId: string): string {
  return `gameId ${JSON.stringify(gameId)}, levelId ${JSON.stringify(levelId)}`;
}

function hasLevelFields(level: Record<string, unknown>): boolean {
  const fields = Object.keys(level);
  return (
    fields.length === LEVEL_FIELDS.length && LEVEL_FIELDS.every((field) => fields.includes(field))
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
