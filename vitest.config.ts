import { defineConfig } from 'vitest/config';

// Unit and gate tests. Vitest fails when this selection finds no file.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
  },
});
