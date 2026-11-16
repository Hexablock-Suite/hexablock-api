import { LevelDtoMapper } from '../../../src/adapters/http/level-dto.mapper.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import {
  checkedLevel,
  levelExample,
  levelJson,
  type LevelJson,
} from '../../support/level-format.js';
import { incomingLevel } from '../../support/level-update.js';

const SHAPE_PROBLEM = 'levels must be an array of objects';
const FIELDS_PROBLEM =
  'a level holds exactly the fields gameId, levelId, order, version, topology and section';

// A level of the format with no section field.
function withoutSection(json: LevelJson): Record<string, unknown> {
  return Object.fromEntries(Object.entries(json).filter(([field]) => field !== 'section'));
}

// LevelDtoMapper translates between LevelDto and LevelDefinition (decision
// 12). It builds the values of the common part and keeps the section as it
// arrives: only the strategy of the gameId knows the section type (#77).
describe('LevelDtoMapper', () => {
  it.each(['hexa-fit', 'hexa-sort'] as const)(
    'should_give_the_json_of_the_format_document_when_a_level_becomes_a_dto',
    (gameId) => {
      const dto = LevelDtoMapper.toDto(checkedLevel(levelExample(gameId)));

      expect(dto).toEqual(levelExample(gameId));
    },
  );

  it('should_build_the_common_values_and_keep_the_section_when_the_body_holds_levels_of_the_format', () => {
    const fit = levelJson('hexa-fit');
    const sort = levelJson('hexa-sort', 'sort-02', 3);

    const request = LevelDtoMapper.toRequest({ levels: [fit, sort] });

    expect(request).toEqual({
      ok: true,
      value: { levels: [incomingLevel(fit), incomingLevel(sort)] },
    });
  });

  // The app has no validation pipe, so the mapper checks the body shape.
  // Each row holds its body in a one-item tuple. it.each spreads a row that
  // is an array, and one body is an array.
  it.each<[unknown]>([
    [undefined],
    [null],
    ['levels'],
    [[levelJson('hexa-fit')]],
    [{}],
    [{ levels: levelJson('hexa-fit') }],
    [{ levels: [levelJson('hexa-fit'), null] }],
    [{ levels: [[levelJson('hexa-fit')]] }],
    [{ levels: ['fit-01'] }],
  ])('should_report_the_shape_problem_when_the_body_holds_no_array_of_level_objects', (body) => {
    expect(LevelDtoMapper.toRequest(body)).toEqual({ ok: false, error: [SHAPE_PROBLEM] });
  });

  // Each problem names its level by its gameId and levelId, so a client can
  // show it. The values of one level are built in the order of the format,
  // and the first broken rule gives the problem of that level.
  it('should_report_each_broken_level_by_game_and_level_id_when_a_common_value_breaks_its_rule', () => {
    const body = {
      levels: [
        { ...levelJson('hexa-fit'), order: 0 },
        levelJson('hexa-fit', 'fit-02'),
        { ...levelJson('hexa-sort'), version: '2', topology: 'Hex' },
        { ...levelJson('hexa-fit', 'fit-03'), topology: 'Hex' },
        { ...levelJson('hexa-fit', 'fit-04'), extra: true },
        withoutSection(levelJson('hexa-fit', 'fit "05"')),
      ],
    };

    const request = LevelDtoMapper.toRequest(body);

    expect(request).toEqual({
      ok: false,
      error: [
        'gameId "hexa-fit", levelId "fit-01": invalid-order',
        'gameId "hexa-sort", levelId "sort-01": invalid-version',
        'gameId "hexa-fit", levelId "fit-03": invalid-topology',
        `gameId "hexa-fit", levelId "fit-04": ${FIELDS_PROBLEM}`,
        `gameId "hexa-fit", levelId "fit \\"05\\"": ${FIELDS_PROBLEM}`,
      ],
    });
  });

  // A level with no valid gameId or levelId has no name, so its problem
  // names its place in the list.
  it('should_report_the_place_of_the_level_when_its_game_id_or_level_id_breaks_its_rule', () => {
    const body = {
      levels: [
        { ...levelJson('hexa-fit'), gameId: 'Fit' },
        { ...levelJson('hexa-sort'), levelId: ' ' },
        { ...levelJson('hexa-sort'), gameId: undefined },
      ],
    };

    const request = LevelDtoMapper.toRequest(body);

    expect(request).toEqual({
      ok: false,
      error: [
        'levels[0]: gameId must be a lowercase slug, got "Fit".',
        'levels[1]: levelId must be a non-blank string.',
        'levels[2]: gameId must be a lowercase slug, got undefined.',
      ],
    });
  });

  it('should_name_the_game_and_level_id_of_each_problem_when_the_update_reports_level_problems', () => {
    const details = LevelDtoMapper.toDetails([
      { gameId: GameId.of('hexa-fit'), levelId: LevelId.of('fit-01'), problem: 'inexact-witness' },
      {
        gameId: GameId.of('hexa-lines'),
        levelId: LevelId.of('a "b"'),
        problem: 'game-without-levels',
      },
    ]);

    expect(details).toEqual([
      'gameId "hexa-fit", levelId "fit-01": inexact-witness',
      'gameId "hexa-lines", levelId "a \\"b\\"": game-without-levels',
    ]);
  });
});
