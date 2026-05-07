// ============================================================
// Fuelyn — HTTP API Client
// Thin HTTP wrapper with timeout, retry, and typed errors.
// ============================================================

import type { ApiErrorInfo } from '../domain/types';
import { API_RETRY_COUNT, API_RETRY_DELAY_MS, API_TIMEOUT_MS } from '../config/constants';

// ─── Error Classes ───────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly info: ApiErrorInfo,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends ApiError {
  constructor(cause?: unknown) {
    super('Network request failed', {
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the server. Please check your connection.',
      retryable: true,
    });
    this.cause = cause;
  }
}

export class TimeoutError extends ApiError {
  constructor() {
    super('Request timed out', {
      code: 'TIMEOUT',
      message: 'The server took too long to respond.',
      retryable: true,
    });
  }
}

export class ValidationError extends ApiError {
  constructor(detail: string) {
    super(`Response validation failed: ${detail}`, {
      code: 'VALIDATION_ERROR',
      message: 'Received unexpected data from the server.',
      retryable: false,
    });
  }
}

export class RateLimitError extends ApiError {
  constructor() {
    super('Rate limit exceeded', {
      code: 'RATE_LIMIT',
      message: 'Too many requests. Please wait a moment.',
      status: 429,
      retryable: true,
    });
  }
}

// ─── Client Config ───────────────────────────────────────────

export interface ApiClientConfig {
  /** Base URL for API requests. */
  baseUrl: string;
  /** Timeout in ms per request. */
  timeoutMs?: number;
  /** Max retry attempts for retryable errors. */
  retryCount?: number;
  /** Delay between retries in ms. */
  retryDelayMs?: number;
  /** Optional headers added to every request. */
  headers?: Record<string, string>;
}

// ─── Client ──────────────────────────────────────────────────

export class ApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryCount: number;
  private readonly retryDelayMs: number;
  private readonly headers: Record<string, string>;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? API_TIMEOUT_MS;
    this.retryCount = config.retryCount ?? API_RETRY_COUNT;
    this.retryDelayMs = config.retryDelayMs ?? API_RETRY_DELAY_MS;
    this.headers = config.headers ?? {};
  }

  /** Perform a GET request with automatic retry and timeout. */
  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean>,
    options?: { signal?: AbortSignal },
  ): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.fetchWithRetry<T>(url, options?.signal);
  }

  // ─── Internal ────────────────────────────────────────────

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean>,
  ): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async fetchWithRetry<T>(
    url: string,
    externalSignal?: AbortSignal,
    attempt = 0,
  ): Promise<T> {
    try {
      return await this.executeFetch<T>(url, externalSignal);
    } catch (error) {
      if (this.isCancellationError(error)) {
        throw error;
      }

      const isRetryable =
        error instanceof ApiError && error.info.retryable;

      if (isRetryable && attempt < this.retryCount) {
        await this.delay(this.retryDelayMs * (attempt + 1), externalSignal);
        return this.fetchWithRetry<T>(url, externalSignal, attempt + 1);
      }
      throw error;
    }
  }

  private async executeFetch<T>(
    url: string,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    // Combine external abort with our timeout
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...this.headers,
        },
        signal: controller.signal,
      });

      if (response.status === 429) {
        throw new RateLimitError();
      }

      if (!response.ok) {
        throw new ApiError(`HTTP ${response.status}`, {
          code: 'HTTP_ERROR',
          message: `Server responded with status ${response.status}`,
          status: response.status,
          retryable: response.status >= 500,
        });
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error instanceof DOMException && error.name === 'AbortError') {
        if (externalSignal?.aborted) {
          throw new ApiError('Request cancelled', {
            code: 'CANCELLED',
            message: 'Request was cancelled.',
            retryable: false,
          });
        }
        throw new TimeoutError();
      }

      throw new NetworkError(error);
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(new ApiError('Request cancelled', {
        code: 'CANCELLED',
        message: 'Request was cancelled.',
        retryable: false,
      }));
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', onAbort);
        reject(new ApiError('Request cancelled', {
          code: 'CANCELLED',
          message: 'Request was cancelled.',
          retryable: false,
        }));
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private isCancellationError(error: unknown): boolean {
    return error instanceof ApiError && error.info.code === 'CANCELLED';
  }
}
