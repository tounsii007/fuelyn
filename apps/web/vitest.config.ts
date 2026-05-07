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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
