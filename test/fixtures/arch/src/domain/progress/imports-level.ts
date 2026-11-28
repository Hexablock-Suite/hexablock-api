// Wrong example: an aggregate folder imports the folder of another
// aggregate, as level-definition.ts imported progress/level-result.ts before #290.
import { sharedPart } from '../level/shared-part.js';

export function readsTheLevel(): boolean {
  return sharedPart();
}
