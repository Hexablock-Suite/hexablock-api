import type { Score } from '../../../src/domain/progress/score.js';

// Wrong example: a public field. A private field and a #private field pass.
export class Scoreboard {
  best: Score;
  private latest: Score;
  #first: Score;
}
