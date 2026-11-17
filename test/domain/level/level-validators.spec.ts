import { FitLevelValidator } from '../../../src/domain/level/fit/fit-level-validator.js';
import { HexTopology } from '../../../src/domain/level/hex-topology.js';
import { LevelDefinition } from '../../../src/domain/level/level-definition.js';
import { LevelOrder } from '../../../src/domain/level/level-order.js';
import type { LevelProblem } from '../../../src/domain/level/level-problem.js';
import type { LevelValidator } from '../../../src/domain/level/level-validator.js';
import { LevelValidators } from '../../../src/domain/level/level-validators.js';
import { LevelVersion } from '../../../src/domain/level/level-version.js';
import { SortLevelValidator } from '../../../src/domain/level/sort/sort-level-validator.js';
import { Topologies } from '../../../src/domain/level/topologies.js';
import { TopologyId } from '../../../src/domain/level/topology-id.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import { ok, type Result } from '../../../src/domain/shared/result.js';
import { levelExample, testSection, valueOf, type LevelJson } from '../../support/level-format.js';
import type { LevelSection } from '../../../src/domain/level/level-section.js';

// Test double for a strategy. It keeps each call and answers with a fixed result.
class RecordingValidator implements LevelValidator<LevelSection> {
  readonly calls: [unknown, TopologyId][] = [];

  constructor(private readonly answer: Result<LevelSection, LevelProblem>) {}

  sectionOf(raw: unknown, topology: TopologyId): Result<LevelSection, LevelProblem> {
    this.calls.push([raw, topology]);
    return this.answer;
  }
}

const LEVEL_01 = valueOf(LevelId.of('level-01'));
const FIRST = valueOf(LevelOrder.of(1));
const V1 = valueOf(LevelVersion.of(1));
const HEX = valueOf(TopologyId.of('hex'));
const RAW_SECTION = { any: 'section' };

// Checks a level of the format document as the border hands it over: the
// common part as domain values and the section as it arrives.
function checkExample(validators: LevelValidators, json: LevelJson) {
  return validators.check(
    valueOf(GameId.of(json.gameId)),
    valueOf(LevelId.of(json.levelId)),
    valueOf(LevelOrder.of(json.order)),
    valueOf(LevelVersion.of(json.version)),
    valueOf(TopologyId.of(json.topology)),
    json.section,
  );
}

describe('LevelValidators', () => {
  it('should_build_the_level_with_the_strategy_of_its_game_when_the_game_has_level_files', () => {
    const fit = new RecordingValidator(ok(testSection('fit section')));
    const sort = new RecordingValidator(ok(testSection('sort section')));
    const validators = LevelValidators.of([
      [valueOf(GameId.of('hexa-fit')), fit],
      [valueOf(GameId.of('hexa-sort')), sort],
    ]);

    const level = validators.check(
      valueOf(GameId.of('hexa-fit')),
      LEVEL_01,
      FIRST,
      V1,
      HEX,
      RAW_SECTION,
    );

    expect(fit.calls).toEqual([[RAW_SECTION, HEX]]);
    expect(sort.calls).toEqual([]);
    expect(
      valueOf(level).equals(
        valueOf(
          LevelDefinition.of(
            valueOf(GameId.of('hexa-fit')),
            LEVEL_01,
            FIRST,
            V1,
            HEX,
            ok(testSection('any')),
          ),
        ),
      ),
    ).toBe(true);
  });

  // A Map compares object keys by reference, so a GameId built again would
  // find nothing. The registry compares with GameId.equals().
  it('should_find_one_strategy_when_the_same_game_id_is_built_twice', () => {
    const fit = new RecordingValidator(ok(testSection('fit section')));
    const validators = LevelValidators.of([[valueOf(GameId.of('hexa-fit')), fit]]);

    const level = validators.check(
      valueOf(GameId.of('hexa-fit')),
      LEVEL_01,
      FIRST,
      V1,
      HEX,
      RAW_SECTION,
    );

    expect(level.ok).toBe(true);
    expect(fit.calls).toHaveLength(1);
  });

  // Lines and Merge have no level files (API-FR-04).
  it('should_fail_with_a_level_problem_when_no_strategy_serves_the_game', () => {
    const fit = new RecordingValidator(ok(testSection('fit section')));
    const validators = LevelValidators.of([[valueOf(GameId.of('hexa-fit')), fit]]);

    expect(
      validators.check(valueOf(GameId.of('hexa-lines')), LEVEL_01, FIRST, V1, HEX, RAW_SECTION),
    ).toEqual({
      ok: false,
      error: 'game-without-levels',
    });
    expect(fit.calls).toEqual([]);
  });

  it('should_return_the_problem_of_the_section_when_the_strategy_rejects_the_section', () => {
    const fit = new RecordingValidator({ ok: false, error: 'invalid-section' });
    const validators = LevelValidators.of([[valueOf(GameId.of('hexa-fit')), fit]]);

    expect(
      validators.check(valueOf(GameId.of('hexa-fit')), LEVEL_01, FIRST, V1, HEX, RAW_SECTION),
    ).toEqual({
      ok: false,
      error: 'invalid-section',
    });
  });

  // FitLevelValidator (#79) picks the Fit section, and SortLevelValidator
  // (#78) picks the Sort section. The composition root registers both.
  it('should_build_each_example_when_the_strategies_pick_the_fit_and_the_sort_section', () => {
    const validators = LevelValidators.of([
      [
        valueOf(GameId.of('hexa-fit')),
        new FitLevelValidator(Topologies.of([[HEX, new HexTopology()]])),
      ],
      [valueOf(GameId.of('hexa-sort')), new SortLevelValidator()],
    ]);

    expect(checkExample(validators, levelExample('hexa-fit')).ok).toBe(true);
    expect(checkExample(validators, levelExample('hexa-sort')).ok).toBe(true);
  });

  // Two strategies for one game are a defect of the composition root, not a
  // datum of a level, so the factory throws.
  it('should_throw_when_two_entries_name_one_game', () => {
    const entries = [
      [valueOf(GameId.of('hexa-fit')), new RecordingValidator(ok(testSection('first')))],
      [valueOf(GameId.of('hexa-fit')), new RecordingValidator(ok(testSection('second')))],
    ] as const;

    expect(() => LevelValidators.of(entries)).toThrow(
      new RangeError('LevelValidators takes one strategy per gameId.'),
    );
  });
});
