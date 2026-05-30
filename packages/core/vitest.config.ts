import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    coverage: {
      // Enabled only when CI (or a dev) passes `--coverage`; the plain
      // `npm test` stays fast and coverage-free for the pre-push hook.
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'text'],
      // Regression floor set a few points below the current measured
      // coverage (stmts 78 / branch 65 / funcs 76 / lines 81). core is a
      // pure logic library, so the gate is meaningful and stable — it
      // ratchets UP as coverage improves, never down.
      thresholds: {
        statements: 74,
        branches: 60,
        functions: 70,
        lines: 76,
      },
    },
  },
});
