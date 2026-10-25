import { sql } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '../support/test-database.js';

// Spec S10: use cases meet real repositories on an in-memory database.
describe('in-memory database', () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  it('should_answer_select_one_when_in_memory_database_starts', async () => {
    const result = await database.db.execute<{ answer: number }>(sql`select 1 as answer`);

    expect(result.rows).toEqual([{ answer: 1 }]);
  });
});
