// Right example: a variant subfolder imports a shared file of its own folder.
import { sharedPart } from '../shared-part.js';

export function usesSharedPart(): boolean {
  return sharedPart();
}
