// Right example: an aggregate folder imports a value of src/domain/shared/.
import { sharedValue } from '../shared/value.js';

export function readsASharedValue(): boolean {
  return sharedValue();
}
