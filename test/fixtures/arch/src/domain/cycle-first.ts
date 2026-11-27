// Wrong example: two domain files import each other (#221).
// cycle-second.ts imports this file back, so the two form a cycle.
import { secondStep } from './cycle-second.js';

export function firstStep(): boolean {
  return !secondStep();
}
