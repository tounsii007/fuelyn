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
  /** HTTP method — defaults to GET. */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /**
   * Request body. If a non-string value is passed, it is JSON-stringified
   * automatically and `Content-Type: application/json` is set. Pass a
   * pre-encoded string (e.g. FormData-as-text) verbatim if you need full
   * control over the wire format.
   */
  body?: unknown;
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
    // Build headers, layering caller overrides on top of safe defaults.
    // We auto-attach Content-Type for JSON bodies but never overwrite an
    // explicit caller header (e.g. text/plain for an LLM streaming POST).
    const baseHeaders: Record<string, string> = { Accept: 'application/json' };
    let serialisedBody: BodyInit | undefined;
    if (options.body != null) {
      if (typeof options.body === 'string') {
        serialisedBody = options.body;
      } else {
        serialisedBody = JSON.stringify(options.body);
        baseHeaders['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(input, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: {
        ...baseHeaders,
        ...options.headers,
      },
      body: serialisedBody,
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
