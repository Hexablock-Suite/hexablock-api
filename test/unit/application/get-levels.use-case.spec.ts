import { receiveJsonOf } from '../../../src/adapters/received.js';
import { GetLevelsUseCase } from '../../../src/application/levels/get-levels.use-case.js';
import { InMemoryLevelRepository } from '../../support/in-memory-level-repository.js';
import { levelJson, levelValidators } from '../../support/level-format.js';
import { storeLevel } from '../../support/level-repository.contract.js';

// The read of API-FR-04 (#81). It gives every stored level in the order of
// LevelRepository.list(): by gameId, then by levelId, compared as text.
describe('GetLevelsUseCase (API-FR-04)', () => {
  it('should_give_every_stored_level_by_game_and_level_id_when_levels_are_stored', async () => {
    const levels = new InMemoryLevelRepository(levelValidators());
    const stored = [
      levelJson('hexa-sort'),
      levelJson('hexa-fit', 'fit-9'),
      levelJson('hexa-fit', 'fit-10', 2),
    ];
    for (const json of stored) {
      await storeLevel(levels, json);
    }

    const result = await new GetLevelsUseCase(levels).execute();

    if (!result.ok) {
      throw new Error('GetLevels has no expected failure.');
    }
    expect(result.value.map((level) => receiveJsonOf(level))).toEqual([
      stored[2],
      stored[1],
      stored[0],
    ]);
  });

  it('should_give_no_level_when_no_level_is_stored', async () => {
    const result = await new GetLevelsUseCase(
      new InMemoryLevelRepository(levelValidators()),
    ).execute();

    expect(result).toEqual({ ok: true, value: [] });
  });
});
