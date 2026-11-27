import type { ExtraLogEntry } from '../aspects/logging-aspect.js';
import type { ListedLevels } from './listed-levels.js';

// Gives one unavailable-level entry for each broken row of a level read
// (#147). AppModule gives this function to the LoggingAspect of GetLevels, so
// the aspect writes the entries and GetLevelsUseCase holds no logger (#219).
// An entry holds the key of the row and the code of its rule, and no section.
export function unavailableLevelEntries(listed: ListedLevels): readonly ExtraLogEntry[] {
  return listed.unavailable.map(({ gameId, levelId, reason }) => ({
    outcome: 'unavailable-level',
    gameId,
    levelId,
    reason,
  }));
}
