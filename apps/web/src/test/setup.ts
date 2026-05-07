// ============================================================
// Vitest setup — runs before every test file.
//
// We load jest-dom matchers (toBeInTheDocument, toHaveAttribute, …)
// unconditionally because they're environment-agnostic, but we only
// register the React-Testing-Library cleanup for tests that actually
// run in jsdom — guarded so plain-node tests don't choke when the
// `document` global is missing.
// ============================================================

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

if (typeof document !== 'undefined') {
  // Lazy import keeps RTL out of node-only test files.
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
  });
}
