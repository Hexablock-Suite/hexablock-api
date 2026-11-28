import type { UserId } from '../shared/user-id.js';

// The accounts that may update the level definitions, by their user ids
// (#145). A user id names one account, and a name could be signed up first
// by another person, so the list holds ids and no usernames. An empty list
// lets no account in: the update fails closed.
export class LevelEditors {
  private constructor(private readonly ids: readonly UserId[]) {}

  // The list keeps its own copy of the ids.
  static of(ids: readonly UserId[]): LevelEditors {
    return new LevelEditors([...ids]);
  }

  // Tells if the account of this user id may update the levels.
  includes(id: UserId): boolean {
    return this.ids.some((editor) => editor.equals(id));
  }
}
