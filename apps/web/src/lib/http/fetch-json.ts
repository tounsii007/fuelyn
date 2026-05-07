'use client';

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

interface FetchJsonOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: HeadersInit;
}

export async function fetchJson<T>(
  input: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 10_000;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();

  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(input, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new HttpError(`Request failed with status ${response.status}`, response.status);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new HttpError('Request was aborted');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
