// Wrong example: a shared file of a domain folder imports a subfolder of
// that folder, as topology.ts imported fit/rotation.ts before #221.
import { variantStep } from './fit/variant.js';

export function sharedStep(): boolean {
  return variantStep();
}
