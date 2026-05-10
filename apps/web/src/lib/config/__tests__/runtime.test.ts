// ============================================================
// Runtime config helpers tests.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requireInProduction, publicAppOrigin, allowedOrigins } from '../runtime';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('FUELYN_PUBLIC_ORIGIN', 'http://localhost:3000');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('requireInProduction', () => {
  it('returns the value when set', () => {
    expect(requireInProduction('FOO', 'bar')).toBe('bar');
  });

  it('returns empty string in dev when value missing', () => {
    expect(requireInProduction('FOO', undefined)).toBe('');
  });
});

describe('publicAppOrigin / allowedOrigins', () => {
  it('returns FUELYN_PUBLIC_ORIGIN when set', () => {
    expect(publicAppOrigin()).toBe('http://localhost:3000');
  });

  it('falls back to localhost in dev when no env', () => {
    vi.stubEnv('FUELYN_PUBLIC_ORIGIN', '');
    vi.stubEnv('NEXT_PUBLIC_APP_ORIGIN', '');
    expect(publicAppOrigin()).toBe('http://localhost:3000');
  });

  it('allowedOrigins includes the public origin', () => {
    expect(allowedOrigins()).toContain('http://localhost:3000');
  });

  it('allowedOrigins in dev also covers 127.0.0.1', () => {
    expect(allowedOrigins()).toContain('http://127.0.0.1:3000');
  });
});
