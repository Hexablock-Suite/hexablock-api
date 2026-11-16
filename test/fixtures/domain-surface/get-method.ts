import type { Score } from '../../../src/domain/progress/score.js';
import type { UserId } from '../../../src/domain/user/user-id.js';

// Wrong example: a method whose name starts with get, in a class and in an
// interface. A private method with that name passes.
export class Account {
  private constructor(private readonly owner: UserId) {}

  getOwner(): UserId {
    return this.getStoredOwner();
  }

  private getStoredOwner(): UserId {
    return this.owner;
  }
}

export interface ScoreSource {
  getBest(): Score;
}
