import { sql } from 'drizzle-orm';
import { DrizzleLevelRepository } from '../../src/adapters/persistence/drizzle-level-repository.js';
import { LevelRowMapper } from '../../src/adapters/persistence/level-row.mapper.js';
import { levels } from '../../src/adapters/persistence/schema.js';
import { receiveJsonOf } from '../../src/adapters/received.js';
import { FitLevelValidator } from '../../src/domain/level/fit/fit-level-validator.js';
import { HexTopology } from '../../src/domain/level/hex-topology.js';
import type { LevelProblem } from '../../src/domain/level/level-problem.js';
import type { LevelValidator } from '../../src/domain/level/level-validator.js';
import { LevelValidators } from '../../src/domain/level/level-validators.js';
import { SortLevelValidator } from '../../src/domain/level/sort/sort-level-validator.js';
import { Topologies } from '../../src/domain/level/topologies.js';
import { TopologyId } from '../../src/domain/level/topology-id.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import type { Result } from '../../src/domain/shared/result.js';
import {
  checkedLevel,
  levelExample,
  levelJson,
  levelValidators,
  valueOf,
  type LevelJson,
} from '../support/level-format.js';
import {
  describeLevelRepositoryContract,
  listedJson,
  storeLevel,
} from '../support/level-repository.contract.js';
import { createTestDatabase, type TestDatabase } from '../support/test-database.js';

// One PGlite database for the whole file. A new PGlite costs about one
// second to start, and the migrations cost about 20 ms, so a test that starts
// its own database pays that second each time. Each test starts with an
// empty levels table instead: the repository reads and writes no other table.
let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await emptyLevels();
});

async function emptyLevels(): Promise<void> {
  await database.db.delete(levels);
}

describeLevelRepositoryContract(
  'DrizzleLevelRepository',
  () => new DrizzleLevelRepository(database.db, levelValidators()),
);

async function countLevelRows(): Promise<number | undefined> {
  const result = await database.db.execute<{ count: number }>(
    sql`select count(*)::int as count from levels`,
  );
  return result.rows[0]?.count;
}

// The levels row of a level of the format: the common part and the section as JSON.
function rowOf(json: LevelJson) {
  const { gameId, levelId, order, version, topology, section } = json;
  return { gameId, levelId, order, version, topology, section };
}

// Test double for a strategy. It keeps each raw section that it reads and
// asks the real strategy of its game.
class RecordingStrategy implements LevelValidator<unknown> {
  readonly read: unknown[] = [];

  constructor(private readonly strategy: LevelValidator<unknown>) {}

  sectionOf(raw: unknown, topology: TopologyId): Result<unknown, LevelProblem> {
    this.read.push(raw);
    return this.strategy.sectionOf(raw, topology);
  }
}

// API-FR-04 and DS-6: one row per gameId and levelId, with the section as JSON.
describe('DrizzleLevelRepository', () => {
  it('should_create_the_levels_table_unique_on_game_and_level_id_when_migrations_run', async () => {
    const columns = await database.db.execute<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      sql`select column_name, data_type, is_nullable from information_schema.columns
          where table_name = 'levels' order by column_name`,
    );
    const keys = await database.db.execute<{ constraint_type: string; columns: string }>(
      sql`select tc.constraint_type,
                 string_agg(kcu.column_name, ',' order by kcu.ordinal_position) as columns
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on kcu.constraint_name = tc.constraint_name and kcu.table_name = tc.table_name
          where tc.table_name = 'levels'
          group by tc.constraint_type, tc.constraint_name`,
    );

    expect(columns.rows).toEqual([
      { column_name: 'game_id', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'level_id', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'order', data_type: 'bigint', is_nullable: 'NO' },
      { column_name: 'section', data_type: 'jsonb', is_nullable: 'NO' },
      { column_name: 'topology', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'version', data_type: 'bigint', is_nullable: 'NO' },
    ]);
    expect(keys.rows).toEqual([{ constraint_type: 'PRIMARY KEY', columns: 'game_id,level_id' }]);
  });

  it('should_list_both_levels_back_when_two_levels_are_saved', async () => {
    const repository = new DrizzleLevelRepository(database.db, levelValidators());

    await storeLevel(repository, levelExample('hexa-fit'));
    await storeLevel(repository, levelExample('hexa-sort'));

    expect(await listedJson(repository)).toEqual([
      levelExample('hexa-fit'),
      levelExample('hexa-sort'),
    ]);
    expect(await countLevelRows()).toBe(2);
  });

  it('should_keep_one_row_when_one_level_is_saved_twice', async () => {
    const repository = new DrizzleLevelRepository(database.db, levelValidators());

    await storeLevel(repository, levelJson('hexa-sort', 'sort-01', 1));
    await storeLevel(repository, levelJson('hexa-sort', 'sort-01', 3));

    expect(await countLevelRows()).toBe(1);
    expect(await listedJson(repository)).toEqual([levelJson('hexa-sort', 'sort-01', 3)]);
  });

  // A level is born valid (#77), also from the database: LevelRowMapper
  // builds each stored section through the strategy of the row's gameId.
  it('should_restore_a_stored_fit_row_and_a_stored_sort_row_into_valid_levels_when_rows_are_read', async () => {
    const hex = Topologies.of([[valueOf(TopologyId.of('hex')), new HexTopology()]]);
    const fit = new RecordingStrategy(new FitLevelValidator(hex));
    const sort = new RecordingStrategy(new SortLevelValidator());
    const validators = LevelValidators.of([
      [valueOf(GameId.of('hexa-fit')), fit],
      [valueOf(GameId.of('hexa-sort')), sort],
    ]);
    await database.db
      .insert(levels)
      .values([rowOf(levelExample('hexa-sort')), rowOf(levelExample('hexa-fit'))]);

    const listed = await new DrizzleLevelRepository(database.db, validators).list();

    expect(fit.read).toEqual([levelExample('hexa-fit').section]);
    expect(sort.read).toEqual([levelExample('hexa-sort').section]);
    expect(listed.map((level) => receiveJsonOf(level))).toEqual([
      levelExample('hexa-fit'),
      levelExample('hexa-sort'),
    ]);
  });

  // A stored row that no strategy accepts is a server fault, not a level
  // problem of a client. The strategy is the one of the row's gameId. Each
  // case starts with an empty levels table (beforeEach).
  it.each<[ReturnType<typeof rowOf>, string]>([
    [
      { ...rowOf(levelExample('hexa-sort')), gameId: 'hexa-lines', levelId: 'lines-01' },
      'The levels row hexa-lines/lines-01 breaks the level rule game-without-levels.',
    ],
    [
      { ...rowOf(levelExample('hexa-fit')), gameId: 'hexa-sort', levelId: 'sort-01' },
      'The levels row hexa-sort/sort-01 breaks the level rule invalid-section.',
    ],
    [
      { ...rowOf(levelExample('hexa-fit')), version: 0 },
      'The levels row hexa-fit/fit-01 breaks the level rule invalid-version.',
    ],
  ])('should_reject_the_read_when_no_strategy_accepts_a_stored_row', async (row, message) => {
    await database.db.insert(levels).values(row);

    await expect(new DrizzleLevelRepository(database.db, levelValidators()).list()).rejects.toThrow(
      message,
    );
  });

  // The row keeps the common part as text and numbers and the section as
  // the JSON of the shared level format.
  it.each([levelExample('hexa-fit'), levelExample('hexa-sort')])(
    'should_write_the_common_part_and_the_section_of_the_format_when_a_level_becomes_a_row',
    (example) => {
      expect(LevelRowMapper.toRow(checkedLevel(example))).toEqual(rowOf(example));
    },
  );
});
