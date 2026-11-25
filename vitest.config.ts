import { defineConfig } from 'vitest/config';

// Unit and gate tests. Vitest fails when this selection finds no file.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
    // A maximum worker budget, not a per-machine optimum. Database-backed tests
    // each initialize their own PGlite WASM instance, and measured parallel
    // initialization inflated boot time beyond the existing test and hook
    // budgets. (#173)
    maxWorkers: 4,
  },
});
