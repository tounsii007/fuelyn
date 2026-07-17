import path from 'node:path';
import type { NextConfig } from 'next';

// Phase A3 — Bundle analyzer.
// Wraps the config only when ANALYZE=true is set, so the production
// build path stays unchanged. Run via:
//   ANALYZE=true npm run build --workspace=@fuelyn/web
// Then open .next/analyze/{client,nodejs,edge}.html
//
// We `require()` lazily so the dependency is optional — if it's not
// installed (e.g. in the container build), the call no-ops instead
// of throwing at import time.
type AnalyzerWrapper = (cfg: NextConfig) => NextConfig;
function loadAnalyzer(): AnalyzerWrapper {
  if (process.env.ANALYZE !== 'true') return (c) => c;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const wrap = require('@next/bundle-analyzer')({ enabled: true });
    return wrap as AnalyzerWrapper;
  } catch {
    // Dependency not installed — silently fall back to identity wrapper.
    // Add @next/bundle-analyzer to devDependencies to enable.
    return (c) => c;
  }
}

const nextConfig: NextConfig = {
  // Required for the production Docker image: emits a self-contained server
  // bundle in `.next/standalone/` (with all its node_modules) that the
  // Dockerfile copies into the runtime stage.
  output: 'standalone',

  // Trace files OUTSIDE this app directory too, so the standalone output
  // includes the workspace's `packages/core` source code.
  outputFileTracingRoot: path.join(__dirname, '../../'),

  transpilePackages: ['@fuelyn/core'],

  // Don't advertise the framework — small security/perf nicety.
  poweredByHeader: false,

  // Allow dev server access from phones/tablets on the same network (HTTP + HTTPS)
  allowedDevOrigins: [
    'http://192.168.178.31:3000',
    'https://192.168.178.31:3000',
    'http://192.168.178.31:3200',
    'https://192.168.178.31:3200',
    'http://localhost:3000',
    'https://localhost:3000',
    'http://localhost:3200',
    'https://localhost:3200',
  ],

  experimental: {
    // Enable server actions for future form handling
    serverActions: {
      bodySizeLimit: '1mb',
    },
    // Tree-shake heavy barrel imports into direct submodule imports at
    // build time. @fuelyn/core is imported 160+ times across the app;
    // this keeps unused exports out of each route's bundle.
    optimizePackageImports: ['@fuelyn/core', '@tanstack/react-query'],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default loadAnalyzer()(nextConfig);
