import { describe, expect, it } from 'vitest';
import { safeEqual } from './timing-safe';

describe('safeEqual', () => {
  it('returns true for identical strings', () => {
    expect(safeEqual('secret', 'secret')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(safeEqual('secret', 'Secret')).toBe(false);
    expect(safeEqual('aaaaaa', 'aaaaab')).toBe(false);
  });

  it('returns false for strings of different lengths', () => {
    expect(safeEqual('short', 'much-longer-token')).toBe(false);
  });

  it('returns true for two empty strings', () => {
    expect(safeEqual('', '')).toBe(true);
  });

  it('handles non-ASCII without throwing', () => {
    expect(safeEqual('über-secret', 'über-secret')).toBe(true);
    expect(safeEqual('über-secret', 'uber-secret')).toBe(false);
  });

  it('handles 64-byte tokens typical for CRON_SECRET', () => {
    const token = 'a'.repeat(64);
    expect(safeEqual(token, token)).toBe(true);
    expect(safeEqual(token, 'b' + token.slice(1))).toBe(false);
  });
});
