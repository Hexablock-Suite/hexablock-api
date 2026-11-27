import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LevelJson } from './level-format.js';

// Copies of the bundled Fit level files of the app on the square and the
// triangle topologies (hexablock-app `src/adapters/levels/fit/`, #229). The
// API must accept each of them, as it accepts the hex levels.
export const SQUARE_AND_TRIANGLE_FIT_LEVELS = [
  'fit-square-01',
  'fit-square-02',
  'fit-square-03',
  'fit-triangle-01',
  'fit-triangle-02',
  'fit-triangle-03',
] as const;

export type AppLevelName = (typeof SQUARE_AND_TRIANGLE_FIT_LEVELS)[number];

const FIXTURES = resolve(import.meta.dirname, '../fixtures/app-levels');

// One bundled level file of the app, parsed. Each call reads the file again,
// so a test can change its copy.
export function appLevelJson(name: AppLevelName): LevelJson {
  return JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), 'utf8')) as LevelJson;
}
