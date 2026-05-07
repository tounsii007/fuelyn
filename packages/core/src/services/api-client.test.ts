import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, RateLimitError } from './api-client';

describe('ApiClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not retry cancelled requests', async () => {
    const client = new ApiClient({
      baseUrl: 'https://example.com',
      retryCount: 3,
      retryDelayMs: 1,
      timeoutMs: 100,
    });
    const signal = AbortSignal.abort();
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(client.get('/stations', undefined, { signal })).rejects.toMatchObject({
      info: { code: 'CANCELLED' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries retryable errors until the request succeeds', async () => {
    const client = new ApiClient({
      baseUrl: 'https://example.com',
      retryCount: 2,
      retryDelayMs: 1,
      timeoutMs: 100,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 429, ok: false })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ ok: true }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(client.get<{ ok: boolean }>('/stations')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops retrying when the backoff delay is aborted', async () => {
    const client = new ApiClient({
      baseUrl: 'https://example.com',
      retryCount: 2,
      retryDelayMs: 50,
      timeoutMs: 100,
    });
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      controller.abort();
      throw new RateLimitError();
    }));

    await expect(client.get('/stations', undefined, { signal: controller.signal })).rejects.toMatchObject({
      info: { code: 'CANCELLED' },
    });
  });

  it('surfaces server errors as ApiError instances', async () => {
    const client = new ApiClient({
      baseUrl: 'https://example.com',
      retryCount: 0,
      timeoutMs: 100,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 500,
      ok: false,
    }));

    await expect(client.get('/stations')).rejects.toBeInstanceOf(ApiError);
  });
});
