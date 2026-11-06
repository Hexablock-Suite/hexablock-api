import request from 'supertest';
import { FixedClock } from './support/fixed-clock.js';
import { signIn } from './support/http/sign-in.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';

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

describe('progress save and load per variant (API-NFR-03)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp([], { clock: new FixedClock(AT) });
  });

  afterEach(async () => {
    await testApp.close();
  });

  const server = () => testApp.app.getHttpServer();
  const save = (token: string, body: object) =>
    request(server()).post('/progress').set('Authorization', `Bearer ${token}`).send(body);
  const load = (token: string, gameId: string) =>
    request(server()).get(`/progress/${gameId}`).set('Authorization', `Bearer ${token}`);

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
});
