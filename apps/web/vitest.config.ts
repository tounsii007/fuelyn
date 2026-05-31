import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // Mixed environment: most tests run in node, but tests that touch
    // the DOM, CSS, or React rendering opt into jsdom via the
    // `// @vitest-environment jsdom` directive at the top of the file.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    pool: 'threads',
    coverage: {
      // Enabled only when CI (or a dev) passes `--coverage`; plain
      // `npm test` stays coverage-free so the pre-push hook is fast.
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text-summary', 'text'],
      // Intentionally LOW regression floor (~3–4 pts under the current
      // ~14% whole-src coverage). Most of the web tree is presentational
      // UI plus BFF routes that aren't unit-tested yet — that's what the
      // BFF route integration tests (task #22) will raise. The gate's job
      // here is only to stop coverage sliding *backwards*; bump these
      // numbers up as #22 and further tests land.
      thresholds: {
        statements: 10,
        branches: 8,
        functions: 10,
        lines: 10,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
