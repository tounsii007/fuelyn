import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createTypedStorage } from './storage';

function createAdapter(initialValue: string | null = null) {
  let value = initialValue;

  return {
    adapter: {
      getItem: vi.fn(async () => value),
      setItem: vi.fn(async (_key: string, nextValue: string) => {
        value = nextValue;
      }),
      removeItem: vi.fn(async () => {
        value = null;
      }),
    },
    readValue: () => value,
  };
}

describe('TypedStorage', () => {
  it('cleans up corrupted values and falls back to the default', async () => {
    const { adapter } = createAdapter('{"count":"bad"}');
    const storage = createTypedStorage(
      adapter,
      'prefs',
      z.object({ count: z.number() }),
      { count: 0 },
    );

    await expect(storage.get()).resolves.toEqual({ count: 0 });
    expect(adapter.removeItem).toHaveBeenCalledWith('prefs');
  });

  it('rejects invalid values before persisting them', async () => {
    const { adapter } = createAdapter();
    const storage = createTypedStorage(
      adapter,
      'prefs',
      z.object({ count: z.number() }),
      { count: 0 },
    );

    await expect(storage.set({ count: 'bad' } as unknown as { count: number }))
      .rejects
      .toThrow(/does not match schema/i);
    expect(adapter.setItem).not.toHaveBeenCalled();
  });

  it('stores validated updates', async () => {
    const { adapter, readValue } = createAdapter('{"count":1}');
    const storage = createTypedStorage(
      adapter,
      'prefs',
      z.object({ count: z.number() }),
      { count: 0 },
    );

    await expect(storage.update((current) => ({ count: current.count + 1 })))
      .resolves
      .toEqual({ count: 2 });
    expect(readValue()).toBe('{"count":2}');
  });
});
