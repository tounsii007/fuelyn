import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Required for the production Docker image: emits a self-contained server
  // bundle in `.next/standalone/` (with all its node_modules) that the
  // Dockerfile copies into the runtime stage.
  output: 'standalone',

  // Trace files OUTSIDE this app directory too, so the standalone output
  // includes the workspace's `packages/core` source code.
  outputFileTracingRoot: path.join(__dirname, '../../'),

  transpilePackages: ['@fuelyn/core'],

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

export default nextConfig;
