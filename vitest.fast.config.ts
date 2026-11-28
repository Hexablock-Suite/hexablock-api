import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config.js';

// The fast feedback command (#256): the unit and domain tests only. They start
// no database and no HTTP application. `pnpm test` still runs each of them.
export default defineConfig({
  ...unitConfig,
  test: {
    ...unitConfig.test,
    include: ['test/unit/**/*.spec.ts', 'test/domain/**/*.spec.ts'],
  },
});
