// ============================================================
// Runtime configuration helpers (Iter AH — security hardening).
//
// Single source of truth for "what env are we in?", "is this
// secret set?", and "what's our public origin?". Used everywhere
// instead of inlined `process.env.NODE_ENV !== 'production'`
// checks so a misconfigured production deploy fails LOUDLY at
// module load instead of degrading silently to dev fallbacks.
// ============================================================

const PROD = process.env.NODE_ENV === 'production';

// `next build` evaluates every API-route module to collect page data,
// and hard-codes NODE_ENV=production into the compiled bundle. Build
// time is never wired with runtime secrets, so the fail-loud guards
// below would always trip and crash the build. Skip them during the
// build phase — exactly like the DB guard in lib/db/client.ts. The
// checks still fire at real server start (no NEXT_PHASE) the moment a
// misconfigured production deploy boots.
const BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build';

export function isProduction(): boolean {
  return PROD;
}

/**
 * Throw immediately if running in production without a value for
 * `name`. Use at module load so a misconfigured deploy crashes
 * before serving any requests. Exempt during `next build`.
 */
export function requireInProduction(name: string, value: string | undefined): string {
  if (PROD && !BUILD_PHASE && (!value || value.trim() === '')) {
    throw new Error(
      `[fuelyn-runtime] Missing required production env var: ${name}. Refusing to start with insecure defaults.`,
    );
  }
  return value ?? '';
}

/**
 * Server-configured public origin used to build email links and
 * Stripe return URLs. NEVER use the request's Origin header for
 * these — that's attacker-controlled.
 */
export function publicAppOrigin(): string {
  // Treat empty strings as missing — vi.stubEnv('X', '') sets X=''
  // and the nullish-coalescing would otherwise return '' silently.
  const raw = process.env.FUELYN_PUBLIC_ORIGIN || process.env.NEXT_PUBLIC_APP_ORIGIN;
  const value = raw && raw.length > 0 ? raw : undefined;
  if (PROD && !BUILD_PHASE && (!value || !value.startsWith('https://'))) {
    throw new Error(
      '[fuelyn-runtime] FUELYN_PUBLIC_ORIGIN (or NEXT_PUBLIC_APP_ORIGIN) must be set to an https:// origin in production.',
    );
  }
  return value ?? 'http://localhost:3000';
}

/**
 * Allowed-origin allow-list for CSRF/CORS. Returns the configured
 * production origin in production; in dev allows the dev origin
 * + any localhost variant.
 */
export function allowedOrigins(): readonly string[] {
  if (PROD) return [publicAppOrigin()];
  return [
    publicAppOrigin(),
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
}
