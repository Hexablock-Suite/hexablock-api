import request from 'supertest';
import { FixedClock } from './support/fixed-clock.js';
import { signIn } from './support/http/sign-in.js';
import { storeLevels } from './support/http/stored-levels.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';
import { levelJson } from './support/level-format.js';
import { syncInstantOf } from './support/sync-instants.js';

// API-NFR-03: one save-and-load test per variant. Fit and Sort save level
// results. Lines and Merge save a high score. Each test saves its own gameId
// and one other variant, then reads its gameId back. The read must return
// only the entry of that gameId.
const AT = new Date('2026-11-06T10:00:00.000Z');

interface Variant {
  readonly gameId: string;
  // The body of POST /progress.
  readonly save: object;
  // The ProgressDto that the API answers for that body.
  readonly entry: object;
}

const LINES: Variant = {
  gameId: 'hexa-lines',
  save: { gameId: 'hexa-lines', score: 120 },
  entry: { gameId: 'hexa-lines', highScore: 120, updatedAt: AT.toISOString(), results: [] },
};

const MERGE: Variant = {
  gameId: 'hexa-merge',
  save: { gameId: 'hexa-merge', score: 2048 },
  entry: { gameId: 'hexa-merge', highScore: 2048, updatedAt: AT.toISOString(), results: [] },
};

const FIT_LEVEL = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 };
const FIT: Variant = {
  gameId: 'hexa-fit',
  save: { gameId: 'hexa-fit', results: [FIT_LEVEL] },
  entry: { gameId: 'hexa-fit', highScore: null, updatedAt: AT.toISOString(), results: [FIT_LEVEL] },
};

const SORT_LEVEL = { levelId: 'sort-01', stars: 2, moves: 30, elapsedMs: 90000 };
const SORT: Variant = {
  gameId: 'hexa-sort',
  save: { gameId: 'hexa-sort', results: [SORT_LEVEL] },
  entry: {
    gameId: 'hexa-sort',
    highScore: null,
    updatedAt: AT.toISOString(),
    results: [SORT_LEVEL],
  },
};

// GameId is an open value (classes.md decision 5): a variant that is not one
// of the four saves and loads its score with no code change. A level result
// needs a stored level (#135), and a level needs the strategy of its game,
// so a new variant with level results needs that strategy first.
const NEW: Variant = {
  gameId: 'hexa-new',
  save: { gameId: 'hexa-new', score: 7 },
  entry: { gameId: 'hexa-new', highScore: 7, updatedAt: AT.toISOString(), results: [] },
};

describe('progress save and load per variant (API-NFR-03)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp([], { clock: new FixedClock(syncInstantOf(AT)) });
    // A result needs its stored level (#135).
    await storeLevels(
      testApp,
      levelJson('hexa-fit', 'fit-01'),
      levelJson('hexa-sort', 'sort-01'),
      levelJson('hexa-sort', 'sort-02'),
    );
  });

  afterEach(async () => {
    await testApp.close();
  });

  const server = () => testApp.app.getHttpServer();
  const save = (token: string, body: object) =>
    request(server()).post('/v1/progress').set('Authorization', `Bearer ${token}`).send(body);
  const load = (token: string, gameId: string) =>
    request(server()).get(`/v1/progress/${gameId}`).set('Authorization', `Bearer ${token}`);

  // Signs in, saves the own variant and one other variant, and loads both.
  // The load of the own gameId returns only the own entry. The load of the
  // other gameId proves that the other entry exists, so the filter excludes
  // a stored entry.
  async function expectSaveAndLoad(own: Variant, other: Variant): Promise<void> {
    const { token } = await signIn(server(), 'ada');

    const savedOwn = await save(token, own.save);
    const savedOther = await save(token, other.save);
    const loadedOwn = await load(token, own.gameId);
    const loadedOther = await load(token, other.gameId);

    expect(savedOwn.status).toBe(200);
    expect(savedOwn.body).toEqual(own.entry);
    expect(savedOther.status).toBe(200);
    expect(savedOther.body).toEqual(other.entry);
    expect(loadedOwn.status).toBe(200);
    expect(loadedOwn.body).toEqual(own.entry);
    expect(loadedOwn.body).not.toEqual(other.entry);
    expect(loadedOther.status).toBe(200);
    expect(loadedOther.body).toEqual(other.entry);
  }

  it('should_load_only_lines_high_score_when_lines_and_fit_are_saved', async () => {
    await expectSaveAndLoad(LINES, FIT);
  });

  it('should_load_only_fit_level_results_when_fit_and_lines_are_saved', async () => {
    await expectSaveAndLoad(FIT, LINES);
  });

  it('should_load_only_sort_level_results_when_sort_and_merge_are_saved', async () => {
    await expectSaveAndLoad(SORT, MERGE);
  });

  it('should_load_only_merge_high_score_when_merge_and_sort_are_saved', async () => {
    await expectSaveAndLoad(MERGE, SORT);
  });

  it('should_load_only_new_variant_entry_when_new_variant_and_lines_are_saved', async () => {
    await expectSaveAndLoad(NEW, LINES);
  });

  // A later sync of the same variant keeps the stored levels, stores a better
  // result of a levelId it sends again (DS-4), and adds a new levelId. The
  // tests compare the results without order: the port contract fixes no order.
  // The answer of the second save and the later load are one case each (#184).
  const retry = { levelId: 'sort-01', stars: 3, moves: 18, elapsedMs: 60000 };
  const next = { levelId: 'sort-02', stars: 1, moves: 40, elapsedMs: 120000 };

  // Signs in, saves sort once, then saves the better sort-01 and the new
  // sort-02. Returns the token and the answer of the second save.
  async function saveSortAgain(): Promise<{ token: string; savedAgain: request.Response }> {
    const { token } = await signIn(server(), 'ada');
    await save(token, SORT.save);
    const savedAgain = await save(token, { gameId: 'hexa-sort', results: [retry, next] });
    return { token, savedAgain };
  }

  function expectBetterAndNewLevelResults(response: request.Response): void {
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      gameId: 'hexa-sort',
      highScore: null,
      updatedAt: AT.toISOString(),
      results: expect.arrayContaining([retry, next]),
    });
    expect(response.body.results).toHaveLength(2);
  }

  it('should_answer_better_and_new_level_results_when_sort_is_saved_again', async () => {
    const { savedAgain } = await saveSortAgain();

    expectBetterAndNewLevelResults(savedAgain);
  });

  it('should_load_better_and_new_level_results_when_sort_is_saved_again', async () => {
    const { token } = await saveSortAgain();

    const loaded = await load(token, 'hexa-sort');

    expectBetterAndNewLevelResults(loaded);
  });
});
