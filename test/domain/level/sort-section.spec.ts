import { BoardRadius } from '../../../src/domain/level/sort/board-radius.js';
import { GoalCount } from '../../../src/domain/level/sort/goal-count.js';
import { Seed } from '../../../src/domain/level/sort/seed.js';
import { SortSection } from '../../../src/domain/level/sort/sort-section.js';
import { StackSource } from '../../../src/domain/level/sort/stack-source.js';
import { TileColor } from '../../../src/domain/level/sort/tile-color.js';
import { deliveredBy } from '../../support/recording-receiver.js';
import { levelExample, valueOf } from '../../support/level-format.js';

// The Sort section of DS-6. Each class checks its own shape when it is created
// and returns a Result. The fixtures come from the Sort example of the format
// document, so the document and the code cannot drift.
function sortSection(): Record<string, unknown> {
  return levelExample('hexa-sort').section;
}

const FIXED_SOURCE = { stacks: [['red', 'red', 'blue'], ['green'], ['blue', 'green']] };

describe('SortSection', () => {
  it('should_build_the_section_when_the_sort_example_is_read', () => {
    expect(SortSection.of(sortSection()).ok).toBe(true);
  });

  it('should_build_the_section_when_the_source_is_a_fixed_list_of_stacks', () => {
    expect(SortSection.of({ ...sortSection(), source: FIXED_SOURCE }).ok).toBe(true);
  });

  it('should_return_invalid_section_when_the_raw_value_is_not_an_object_with_exactly_the_four_fields', () => {
    const bad: unknown[] = [null, [], 'section', { ...sortSection(), extra: true }];

    expect(bad.map((raw) => SortSection.of(raw))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-section' })),
    );
  });

  // Each field gives its own problem, so the border can name the field.
  it('should_return_the_problem_of_the_field_when_a_field_is_missing_or_wrong', () => {
    const section = sortSection();
    const { radius, goals, source, stars } = section;

    expect([
      SortSection.of({ goals, source, stars }),
      SortSection.of({ radius, source, stars }),
      SortSection.of({ radius, goals, stars }),
      SortSection.of({ radius, goals, source }),
      SortSection.of({ ...section, radius: 0 }),
      SortSection.of({ ...section, goals: 0 }),
      SortSection.of({ ...section, source: { seed: 1, colors: [] } }),
      SortSection.of({ ...section, stars: [] }),
      SortSection.of({ ...section, stars: [{ maxMoves: 30, extra: 1 }] }),
    ]).toEqual([
      { ok: false, error: 'invalid-radius' },
      { ok: false, error: 'invalid-goals' },
      { ok: false, error: 'invalid-source' },
      { ok: false, error: 'invalid-stars' },
      { ok: false, error: 'invalid-radius' },
      { ok: false, error: 'invalid-goals' },
      { ok: false, error: 'invalid-source' },
      { ok: false, error: 'invalid-stars' },
      { ok: false, error: 'invalid-stars' },
    ]);
  });

  // Moves.of throws until #103. The section turns that throw into a level
  // problem, so a bad level file never gives a 500.
  it('should_return_invalid_stars_when_a_star_threshold_is_negative', () => {
    expect(SortSection.of({ ...sortSection(), stars: [{ maxMoves: -1 }] })).toEqual({
      ok: false,
      error: 'invalid-stars',
    });
  });

  it('should_be_equal_when_two_sections_are_read_from_the_same_data', () => {
    expect(
      valueOf(SortSection.of(sortSection())).equals(valueOf(SortSection.of(sortSection()))),
    ).toBe(true);
  });

  // The section keeps every field it reads: a change to one value of one
  // field gives another section. Each list keeps its length.
  it('should_differ_when_one_value_of_the_raw_section_differs', () => {
    const example = valueOf(SortSection.of(sortSection()));
    const section = sortSection();
    const stars = section.stars as Record<string, unknown>[];
    const changed = [
      { ...section, radius: (section.radius as number) + 1 },
      { ...section, goals: (section.goals as number) + 1 },
      { ...section, source: FIXED_SOURCE },
      { ...section, stars: [{ maxMoves: 41 }, ...stars.slice(1)] },
    ];

    expect(changed.map((raw) => example.equals(valueOf(SortSection.of(raw))))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('BoardRadius', () => {
  it('should_deliver_the_radius_when_it_is_a_safe_integer_of_1_or_more', () => {
    expect(deliveredBy(valueOf(BoardRadius.of(2)))).toEqual([2]);
  });

  it('should_return_invalid_radius_when_the_radius_is_below_1_or_not_a_safe_integer', () => {
    const bad: unknown[] = [0, -1, 1.5, '2', Number.NaN, 2 ** 53];

    expect(bad.map((raw) => BoardRadius.of(raw))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-radius' })),
    );
  });

  it('should_be_equal_when_two_radii_hold_the_same_number', () => {
    expect(valueOf(BoardRadius.of(2)).equals(valueOf(BoardRadius.of(2)))).toBe(true);
    expect(valueOf(BoardRadius.of(2)).equals(valueOf(BoardRadius.of(3)))).toBe(false);
  });
});

describe('GoalCount', () => {
  // A goal of 0 wins before the first move (app D21), so the goal is 1 or more.
  it('should_deliver_the_goal_when_it_is_a_safe_integer_of_1_or_more', () => {
    expect(deliveredBy(valueOf(GoalCount.of(3)))).toEqual([3]);
  });

  it('should_return_invalid_goals_when_the_goal_is_below_1_or_not_a_safe_integer', () => {
    const bad: unknown[] = [0, -1, 1.5, '3', Number.NaN, 2 ** 53];

    expect(bad.map((raw) => GoalCount.of(raw))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-goals' })),
    );
  });

  it('should_be_equal_when_two_goals_hold_the_same_count', () => {
    expect(valueOf(GoalCount.of(3)).equals(valueOf(GoalCount.of(3)))).toBe(true);
    expect(valueOf(GoalCount.of(3)).equals(valueOf(GoalCount.of(4)))).toBe(false);
  });
});

describe('Seed', () => {
  // The seeds of the app: the unsigned 32-bit integers.
  it('should_deliver_the_seed_when_it_is_an_integer_from_0_to_4294967295', () => {
    expect([0, 4294967295].map((seed) => deliveredBy(valueOf(Seed.of(seed))))).toEqual([
      [0],
      [4294967295],
    ]);
    expect(Object.is(deliveredBy(valueOf(Seed.of(-0)))[0], 0)).toBe(true);
  });

  it('should_return_invalid_seed_when_the_seed_is_outside_the_unsigned_32_bit_integers', () => {
    const bad: unknown[] = [-1, 4294967296, 1.5, '7', Number.NaN];

    expect(bad.map((raw) => Seed.of(raw))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-seed' })),
    );
  });

  it('should_be_equal_when_two_seeds_hold_the_same_number', () => {
    expect(valueOf(Seed.of(7)).equals(valueOf(Seed.of(7)))).toBe(true);
    expect(valueOf(Seed.of(7)).equals(valueOf(Seed.of(8)))).toBe(false);
  });
});

describe('TileColor', () => {
  it('should_deliver_the_name_as_written_when_it_is_a_non_blank_text', () => {
    expect(deliveredBy(valueOf(TileColor.of('Red')))).toEqual(['Red']);
  });

  it('should_return_invalid_color_when_the_name_is_blank_or_not_a_text', () => {
    const bad: unknown[] = ['', '  ', 3, null];

    expect(bad.map((raw) => TileColor.of(raw))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-color' })),
    );
  });

  // The names compare as written, as the app compares its colors.
  it('should_be_equal_when_two_colors_hold_the_same_name', () => {
    expect(valueOf(TileColor.of('red')).equals(valueOf(TileColor.of('red')))).toBe(true);
    expect(valueOf(TileColor.of('red')).equals(valueOf(TileColor.of('Red')))).toBe(false);
  });
});

describe('StackSource', () => {
  const seeded = { seed: 7, colors: ['red', 'green'] };

  // A level picks one of the two kinds of source (app A4).
  it('should_build_the_source_when_it_is_seeded_or_a_fixed_list_of_stacks', () => {
    expect([StackSource.of(seeded).ok, StackSource.of(FIXED_SOURCE).ok]).toEqual([true, true]);
  });

  it('should_return_invalid_source_when_the_raw_source_is_neither_kind', () => {
    const bad: unknown[] = [
      null,
      { ...seeded, ...FIXED_SOURCE },
      { seed: 7 },
      { ...seeded, colors: [] },
      { ...seeded, colors: ['red', ''] },
      { ...seeded, seed: -1 },
      { stacks: [] },
      { stacks: [['red'], []] },
      { stacks: [['red', 4]] },
    ];

    expect(bad.map((raw) => StackSource.of(raw))).toEqual(
      bad.map(() => ({ ok: false, error: 'invalid-source' })),
    );
  });

  // The order counts: a draw picks a color by its place, and a fixed source
  // gives its stacks in order, each stack from the bottom tile up.
  it('should_be_equal_when_two_sources_hold_the_same_kind_and_the_same_data_in_order', () => {
    const source = valueOf(StackSource.of(seeded));
    const fixed = valueOf(StackSource.of(FIXED_SOURCE));

    expect([
      source.equals(valueOf(StackSource.of({ seed: 7, colors: ['red', 'green'] }))),
      source.equals(valueOf(StackSource.of({ seed: 8, colors: ['red', 'green'] }))),
      source.equals(valueOf(StackSource.of({ seed: 7, colors: ['green', 'red'] }))),
      source.equals(fixed),
      fixed.equals(source),
      fixed.equals(
        valueOf(StackSource.of({ stacks: [['red', 'red', 'blue'], ['green'], ['blue', 'green']] })),
      ),
      fixed.equals(
        valueOf(StackSource.of({ stacks: [['blue', 'red', 'red'], ['green'], ['blue', 'green']] })),
      ),
    ]).toEqual([true, false, false, false, false, true, false]);
  });
});
