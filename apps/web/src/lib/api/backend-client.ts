// ============================================================
// Backend API Client
// Proxies requests to the Java Gateway (port 8080).
// Used by BFF routes that need to call the Java microservices.
// ============================================================

import { requireInProduction } from '@/lib/config/runtime';

const BACKEND_URL = process.env.JAVA_BACKEND_URL ?? 'http://localhost:8080';
// In production a missing key crashes at module load (fail loud) rather
// than silently authenticating to the gateway with the committed dev
// default; the dev fallback only applies outside production.
const API_KEY =
  requireInProduction('JAVA_BACKEND_API_KEY', process.env.JAVA_BACKEND_API_KEY) ||
  'dev-api-key-change-in-production';
const TIMEOUT_MS = 10_000;

interface BackendRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  timeout?: number;
  /** Extra headers to forward (e.g. the caller's Authorization so the
   *  gateway can resolve the user). Cannot override the service X-API-Key. */
  headers?: Record<string, string>;
}

export class BackendApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'BackendApiError';
  }
}

/**
 * Makes a request to the Java backend gateway.
 * Adds API key header and handles timeouts.
 */
export async function backendFetch<T>(
  path: string,
  options: BackendRequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, timeout = TIMEOUT_MS, headers: extraHeaders } = options;
  const url = `${BACKEND_URL}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...extraHeaders,
      // Applied last so a caller-supplied header can't override the
      // service credential the gateway authenticates us with.
      'X-API-Key': API_KEY,
    };

    if (body != null) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new BackendApiError(
        `Backend responded with ${response.status}`,
        response.status,
        text,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof BackendApiError) throw error;

    if (error instanceof Error && error.name === 'AbortError') {
      throw new BackendApiError('Backend request timed out', 504);
    }

    throw new BackendApiError(
      `Backend connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}
