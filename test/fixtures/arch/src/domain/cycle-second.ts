// Wrong example: the other half of the cycle of cycle-first.ts (#221).
import { firstStep } from './cycle-first.js';

export function secondStep(): boolean {
  return firstStep();
}
