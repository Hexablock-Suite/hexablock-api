import type { LevelRow } from '../../src/adapters/persistence/level-row.mapper.js';
import { receiveJsonOf, receiveValueOf } from '../../src/adapters/received.js';
import type { LevelRepository } from '../../src/application/ports/level-repository.js';
import type { LevelDefinition } from '../../src/domain/level/level-definition.js';
import type { StoredLevel } from '../../src/domain/level/stored-level.js';
import { LevelVersion } from '../../src/domain/level/level-version.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { LevelId } from '../../src/domain/progress/level-id.js';
import { err, ok, type Result } from '../../src/domain/shared/result.js';
import { checkedLevel, levelJson, type LevelJson } from './level-format.js';
import { levelResultOf } from './level-results.js';
import { valueOf } from './result.js';

const FIT = valueOf(GameId.of('hexa-fit'));
const FIT_01 = valueOf(LevelId.of('fit-01'));
const SORT = valueOf(GameId.of('hexa-sort'));
const SORT_01 = valueOf(LevelId.of('sort-01'));

// Stores a level of the format through the port: the change ignores the
// stored level and returns the given one.
export function storeLevel(
  repository: LevelRepository,
  json: LevelJson,
): Promise<Result<LevelDefinition, unknown>> {
  const level = checkedLevel(json);
  return repository.update(valueOf(GameId.of(json.gameId)), valueOf(LevelId.of(json.levelId)), () =>
    ok(level),
  );
}

// The JSON of each valid level that list() gives, in its order.
export async function listedJson(repository: LevelRepository): Promise<unknown[]> {
  return (await repository.list()).levels.map((level) => receiveJsonOf(level));
}

// Writes one levels row as it is, with no check, as a manual change of the
// database can write it. The row of a level of the format, with a broken
// section or version, is the usual case.
export type StoreRow = (repository: LevelRepository, row: LevelRow) => Promise<void>;

// The levels row of a level of the format, with a Fit section that breaks
// its rule (#147). It is the row of the e2e test of GET /levels.
export function brokenRow(json: LevelJson, version = json.version): LevelRow {
  const { gameId, levelId, order, topology } = json;
  return { gameId, levelId, order, version, topology, section: { figure: [] } };
}

// The state of a stored level as a test compares it: the JSON of a valid
// level, so a copy compares equal.
function seenState(stored: StoredLevel): unknown {
  return stored.state === 'valid' ? { state: 'valid', json: receiveJsonOf(stored.level) } : stored;
}

// The version of a level as a number, so a test can count the updates.
function versionOf(level: LevelDefinition): number {
  return receiveValueOf(receiveValueOf(level).version);
}

// Contract of the LevelRepository port: one level per gameId and levelId
// (API-FR-04, DS-6). The in-memory fake and the Drizzle adapter (#80) run
// the same cases, so the fake promises nothing that the adapter breaks.
export function describeLevelRepositoryContract(
  name: string,
  createRepository: () => LevelRepository | Promise<LevelRepository>,
  storeRow: StoreRow,
): void {
  describe(`LevelRepository contract: ${name}`, () => {
    it('should_list_no_level_when_no_level_is_stored', async () => {
      const repository = await createRepository();

      await expect(repository.list()).resolves.toEqual({ levels: [], unavailable: [] });
    });

    // The port promises the levels by gameId, then by levelId, compared as
    // text: fit-10 comes before fit-9. The Drizzle adapter sorts them in SQL.
    it('should_list_each_level_by_game_and_level_id_when_levels_are_saved_out_of_order', async () => {
      const repository = await createRepository();
      const saved = [
        levelJson('hexa-sort'),
        levelJson('hexa-fit', 'fit-9'),
        levelJson('hexa-fit', 'fit-10', 2),
      ];

      for (const json of saved) {
        await storeLevel(repository, json);
      }

      expect(await listedJson(repository)).toEqual([saved[2], saved[1], saved[0]]);
    });

    // update() runs one change while it holds the lock of one gameId and
    // levelId. With no stored level, the change gets the absent state.
    it('should_pass_the_absent_state_to_change_and_save_its_level_when_no_level_is_stored', async () => {
      const repository = await createRepository();
      const seen: StoredLevel[] = [];
      const level = checkedLevel(levelJson('hexa-fit'));

      const saved = await repository.update(FIT, FIT_01, (stored) => {
        seen.push(stored);
        return ok(level);
      });

      expect(seen).toEqual([{ state: 'absent' }]);
      expect(saved.ok && saved.value).toBe(level);
      expect(await listedJson(repository)).toEqual([levelJson('hexa-fit')]);
    });

    // The change gets a copy of the stored level, and the copy that it
    // returns replaces the stored one. The other levels stay as they are.
    it('should_pass_the_valid_state_with_a_copy_of_the_stored_level_to_change_and_replace_it_when_the_level_is_stored', async () => {
      const repository = await createRepository();
      const first = checkedLevel(levelJson('hexa-fit'));
      await repository.update(FIT, FIT_01, () => ok(first));
      await storeLevel(repository, levelJson('hexa-sort'));
      const newer = checkedLevel(levelJson('hexa-fit', 'fit-01', 2));
      const seen: { copy: boolean; json: unknown }[] = [];

      const saved = await repository.update(FIT, FIT_01, (stored) => {
        if (stored.state !== 'valid') {
          return err('game-without-levels');
        }
        seen.push({ copy: stored.level !== first, json: receiveJsonOf(stored.level) });
        return stored.level.accepts(newer);
      });

      expect(seen).toEqual([{ copy: true, json: levelJson('hexa-fit') }]);
      expect(saved.ok && saved.value).toBe(newer);
      expect(await listedJson(repository)).toEqual([
        levelJson('hexa-fit', 'fit-01', 2),
        levelJson('hexa-sort'),
      ]);
    });

    // The version rule of S3-10 runs inside the change. A failed Result
    // saves nothing, and update() resolves to it.
    it('should_save_nothing_and_resolve_the_failed_result_when_change_rejects_the_level', async () => {
      const repository = await createRepository();
      await storeLevel(repository, levelJson('hexa-fit', 'fit-01', 2));
      const older = checkedLevel(levelJson('hexa-fit', 'fit-01', 1));

      const rejected = await repository.update(FIT, FIT_01, (stored) =>
        stored.state === 'valid' ? stored.level.accepts(older) : ok(older),
      );
      const empty = await repository.update(SORT, SORT_01, () => err('invalid-section'));

      expect(rejected).toEqual({ ok: false, error: 'older-version' });
      expect(empty).toEqual({ ok: false, error: 'invalid-section' });
      expect(await listedJson(repository)).toEqual([levelJson('hexa-fit', 'fit-01', 2)]);
    });

    it('should_save_nothing_and_reject_with_its_error_when_change_throws', async () => {
      const repository = await createRepository();
      await storeLevel(repository, levelJson('hexa-fit'));
      const failure = new Error('the change failed');

      const stored = repository.update(FIT, FIT_01, () => {
        throw failure;
      });
      const empty = repository.update(SORT, SORT_01, () => {
        throw failure;
      });

      await expect(stored).rejects.toBe(failure);
      await expect(empty).rejects.toBe(failure);
      expect(await listedJson(repository)).toEqual([levelJson('hexa-fit')]);
    });

    // update() saves a level only under the key that it locks. A change that
    // returns another level is a defect of the caller, so update() throws.
    it('should_reject_and_save_nothing_when_change_returns_another_level', async () => {
      const repository = await createRepository();
      const otherLevel = checkedLevel(levelJson('hexa-fit', 'fit-02'));

      const saved = repository.update(FIT, FIT_01, () => ok(otherLevel));

      await expect(saved).rejects.toThrow('The change must return the level that update() locks.');
      expect(await listedJson(repository)).toEqual([]);
    });

    // Two updates of one level run one after the other: the second change
    // gets the level of the first. PGlite runs one session, so on Drizzle
    // this case shows the order, not the advisory lock.
    it('should_pass_first_level_to_second_change_when_two_updates_of_one_level_overlap', async () => {
      const repository = await createRepository();
      const seen: (number | null)[] = [];
      const raise = (stored: StoredLevel) => {
        const storedVersion = stored.state === 'valid' ? versionOf(stored.level) : null;
        seen.push(storedVersion);
        const version = storedVersion === null ? 1 : storedVersion + 1;
        return ok(checkedLevel(levelJson('hexa-fit', 'fit-01', version)));
      };

      await Promise.all([
        repository.update(FIT, FIT_01, raise),
        repository.update(FIT, FIT_01, raise),
      ]);

      expect(seen).toEqual([null, 1]);
      expect(await listedJson(repository)).toEqual([levelJson('hexa-fit', 'fit-01', 2)]);
    });
    // #147: a stored row that breaks a rule is the broken state, never the
    // absent state. It carries the code of the first broken rule and the
    // stored version, so the change can still run the version rule.
    it('should_pass_the_broken_state_with_its_reason_and_stored_version_to_change_when_the_stored_section_breaks_its_rule', async () => {
      const repository = await createRepository();
      await storeRow(repository, brokenRow(levelJson('hexa-fit'), 3));
      const seen: unknown[] = [];

      const saved = await repository.update(FIT, FIT_01, (stored) => {
        seen.push(seenState(stored));
        return err('invalid-section');
      });

      expect(seen).toEqual([
        { state: 'broken', reason: 'invalid-figure', version: valueOf(LevelVersion.of(3)) },
      ]);
      expect(saved).toEqual({ ok: false, error: 'invalid-section' });
    });

    // A version column that LevelVersion does not accept gives no version.
    it('should_pass_the_broken_state_with_no_version_to_change_when_the_stored_version_breaks_its_rule', async () => {
      const repository = await createRepository();
      await storeRow(repository, { ...brokenRow(levelJson('hexa-fit')), version: 0 });
      const seen: unknown[] = [];

      await repository.update(FIT, FIT_01, (stored) => {
        seen.push(seenState(stored));
        return err('invalid-version');
      });

      expect(seen).toEqual([{ state: 'broken', reason: 'invalid-version', version: null }]);
    });

    // The level that the change returns replaces the broken row.
    it('should_replace_the_broken_row_with_the_level_of_the_change_when_the_change_returns_a_level', async () => {
      const repository = await createRepository();
      await storeRow(repository, brokenRow(levelJson('hexa-fit')));
      const level = checkedLevel(levelJson('hexa-fit', 'fit-01', 2));

      const saved = await repository.update(FIT, FIT_01, () => ok(level));

      expect(saved.ok && saved.value).toBe(level);
      await expect(listedJson(repository)).resolves.toEqual([levelJson('hexa-fit', 'fit-01', 2)]);
      expect((await repository.list()).unavailable).toEqual([]);
    });

    // list() gives the valid levels and the broken rows apart, each by
    // gameId and then by levelId. A broken row names its key as the row
    // holds it and the code of its first broken rule.
    it('should_list_the_valid_levels_and_each_broken_row_apart_when_a_stored_row_breaks_a_rule', async () => {
      const repository = await createRepository();
      await storeRow(repository, brokenRow(levelJson('hexa-fit', 'fit-02')));
      await storeLevel(repository, levelJson('hexa-sort'));
      await storeRow(repository, { ...brokenRow(levelJson('hexa-fit')), version: 0 });

      const listed = await repository.list();

      expect(listed.levels.map((level) => receiveJsonOf(level))).toEqual([levelJson('hexa-sort')]);
      expect(listed.unavailable).toEqual([
        { gameId: 'hexa-fit', levelId: 'fit-01', reason: 'invalid-version' },
        { gameId: 'hexa-fit', levelId: 'fit-02', reason: 'invalid-figure' },
      ]);
    });

    // #146: the board of a level asks whether the definitions hold the
    // level. A broken row is still a level that the definitions hold, so
    // holds() answers true for it. Only a key with no row answers false.
    it('should_answer_true_for_a_valid_and_a_broken_row_and_false_for_an_unknown_key_when_holds_is_asked', async () => {
      const repository = await createRepository();
      await storeLevel(repository, levelJson('hexa-fit'));
      await storeRow(repository, brokenRow(levelJson('hexa-sort', 'sort-01')));

      const valid = await repository.holds(FIT, FIT_01);
      const broken = await repository.holds(SORT, SORT_01);
      const unknownLevel = await repository.holds(FIT, valueOf(LevelId.of('no-such-level')));
      const otherGame = await repository.holds(valueOf(GameId.of('hexa-lines')), FIT_01);

      expect({ valid, broken, unknownLevel, otherGame }).toEqual({
        valid: true,
        broken: true,
        unknownLevel: false,
        otherGame: false,
      });
    });

    // #217: findFor() reads the valid levels of every result of one sync in
    // one query. It gives them by levelId, and no level that the results do
    // not name leaves the repository (#171).
    it('should_give_the_stored_levels_by_level_id_when_the_rows_of_the_keys_of_the_results_are_valid', async () => {
      const repository = await createRepository();
      await storeLevel(repository, levelJson('hexa-fit', 'fit-01'));
      await storeLevel(repository, levelJson('hexa-fit', 'fit-02'));
      await storeLevel(repository, levelJson('hexa-fit', 'fit-03'));
      const results = [
        levelResultOf({ levelId: 'fit-03', stars: 1, moves: 12, elapsedMs: 45000 }),
        levelResultOf({ levelId: 'fit-01', stars: 2, moves: 10, elapsedMs: 30000 }),
      ];

      const found = await repository.findFor(FIT, results);

      expect(found.map((level) => receiveJsonOf(level))).toEqual([
        levelJson('hexa-fit', 'fit-01'),
        levelJson('hexa-fit', 'fit-03'),
      ]);
    });

    // The sync of a result that no stored level names fails before the lock,
    // so findFor() gives no level for it.
    it('should_give_no_level_when_no_row_is_stored_for_the_keys_of_the_results', async () => {
      const repository = await createRepository();
      const result = levelResultOf({ levelId: 'fit-01', stars: 1, moves: 12, elapsedMs: 45000 });

      const found = await repository.findFor(FIT, [result]);

      expect(found).toEqual([]);
    });

    // A stored row that breaks a rule holds no level and no star thresholds
    // (#147), so findFor() leaves it out, as list() keeps it apart.
    it('should_leave_out_the_row_when_the_stored_row_of_the_key_of_a_result_breaks_a_rule', async () => {
      const repository = await createRepository();
      await storeRow(repository, brokenRow(levelJson('hexa-fit', 'fit-01')));
      await storeLevel(repository, levelJson('hexa-fit', 'fit-02'));
      const results = [
        levelResultOf({ levelId: 'fit-01', stars: 1, moves: 12, elapsedMs: 45000 }),
        levelResultOf({ levelId: 'fit-02', stars: 1, moves: 12, elapsedMs: 45000 }),
      ];

      const found = await repository.findFor(FIT, results);

      expect(found.map((level) => receiveJsonOf(level))).toEqual([levelJson('hexa-fit', 'fit-02')]);
    });

    // The key of the query joins the gameId of the sync and the levelId of
    // each result: a level of another game and a level with no row stay
    // out, as holds() answers false for both keys.
    it('should_leave_out_the_level_when_a_result_names_another_game_or_an_unknown_level', async () => {
      const repository = await createRepository();
      await storeLevel(repository, levelJson('hexa-fit'));
      await storeLevel(repository, levelJson('hexa-sort'));
      const fit01 = levelResultOf({ levelId: 'fit-01', stars: 1, moves: 12, elapsedMs: 45000 });
      const unknown = levelResultOf({
        levelId: 'no-such-level',
        stars: 1,
        moves: 12,
        elapsedMs: 45000,
      });

      const otherGame = await repository.findFor(SORT, [fit01]);
      const unknownLevel = await repository.findFor(FIT, [unknown, fit01]);

      expect(otherGame).toEqual([]);
      expect(unknownLevel.map((level) => receiveJsonOf(level))).toEqual([levelJson('hexa-fit')]);
    });

    // Two results of one level name one row, so the level comes once.
    it('should_give_the_level_once_when_two_results_name_the_same_level', async () => {
      const repository = await createRepository();
      await storeLevel(repository, levelJson('hexa-fit'));
      const results = [
        levelResultOf({ levelId: 'fit-01', stars: 1, moves: 20, elapsedMs: 60000 }),
        levelResultOf({ levelId: 'fit-01', stars: 3, moves: 9, elapsedMs: 30000 }),
      ];

      const found = await repository.findFor(FIT, results);

      expect(found.map((level) => receiveJsonOf(level))).toEqual([levelJson('hexa-fit')]);
    });

    // No result names no level, so no level leaves the repository.
    it('should_give_no_level_when_the_list_of_results_is_empty', async () => {
      const repository = await createRepository();
      await storeLevel(repository, levelJson('hexa-fit'));

      const found = await repository.findFor(FIT, []);

      expect(found).toEqual([]);
    });
  });
}
