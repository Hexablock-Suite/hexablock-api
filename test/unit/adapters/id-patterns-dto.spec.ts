import { DECORATORS } from '@nestjs/swagger';
import { LevelDto } from '../../../src/adapters/http/level.dto.js';
import { SyncProgressDto } from '../../../src/adapters/http/progress.dto.js';
import { TopologyId } from '../../../src/domain/level/topology-id.js';
import { GameId } from '../../../src/domain/progress/game-id.js';

// One code point, two UTF-16 units.
const EMOJI = '\u{1F600}';

// #214: three DTO properties copy a pattern of the domain into the OpenAPI
// schema. GameId.of() checks the characters of a gameId. TopologyId.of()
// checks the characters of a topology, so the topology property follows
// TopologyId, not GameId. Each copy must accept the same names as its
// factory, so a change on one side only fails here. The test compares only
// the characters: INCOMING_ID_BOUNDS holds the length bounds, and the
// factories have none.
const PROPERTIES = [
  {
    title: 'SyncProgressDto.gameId',
    dto: SyncProgressDto,
    property: 'gameId',
    accepts: (name: string) => GameId.of(name).ok,
  },
  {
    title: 'LevelDto.gameId',
    dto: LevelDto,
    property: 'gameId',
    accepts: (name: string) => GameId.of(name).ok,
  },
  {
    title: 'LevelDto.topology',
    dto: LevelDto,
    property: 'topology',
    accepts: (name: string) => TopologyId.of(name).ok,
  },
];

const NAMES = [
  'hexa-lines',
  'hexa-fit',
  'hex',
  'triangle',
  'a',
  'fit2',
  'a-',
  'a--b',
  '',
  '-hex',
  '2hex',
  'Hexa',
  'hexA',
  'hexa_fit',
  'hexa fit',
  'hexa.fit',
  ' hex',
  'hex\n',
  'hèx',
  `hex${EMOJI}`,
];

// Reads the pattern that @ApiProperty gives to one property of a DTO class.
function patternOf(dto: { prototype: object }, property: string): unknown {
  const options: { pattern?: unknown } | undefined = Reflect.getMetadata(
    DECORATORS.API_MODEL_PROPERTIES,
    dto.prototype,
    property,
  );
  return options?.pattern;
}

describe.each(PROPERTIES)('OpenAPI pattern of $title', ({ dto, property, accepts }) => {
  it.each(NAMES)('should_accept_a_name_only_when_the_domain_factory_accepts_it', (name) => {
    const pattern = patternOf(dto, property);

    expect(pattern).toBeTypeOf('string');
    expect(
      new RegExp(String(pattern)).test(name),
      `${String(pattern)} on ${JSON.stringify(name)}`,
    ).toBe(accepts(name));
  });
});
