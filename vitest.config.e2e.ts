import { defineConfig } from 'vitest/config';

// HTTP end-to-end tests. Vitest fails when this selection finds no file.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
  },
});
