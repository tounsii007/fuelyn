// ============================================================
// Parameterized OpenGraph image generator (Iteration 8 — per-page SEO).
//
// GET /og?title=...&subtitle=...  → branded 1200×630 PNG.
//
// One generator serves every route's share card (wired in via
// lib/seo/metadata.ts), so each shared sub-page link renders its own
// titled card instead of the generic home image — better social CTR.
// Lives at /og (NOT /api/*) so it isn't caught by the robots
// Disallow:/api rule; social scrapers fetch it directly.
// ============================================================

import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { SITE_NAME } from '@/lib/seo/site';

export const runtime = 'nodejs';

// Keep card text from overflowing the layout.
function clamp(value: string | null, max: number, fallback: string): string {
  const v = (value ?? '').trim();
  if (!v) return fallback;
  return v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v;
}

export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = clamp(searchParams.get('title'), 70, 'Der günstigste Tankstopp.');
  const subtitle = clamp(
    searchParams.get('subtitle'),
    120,
    'Effektivpreis statt Pumpenpreis — Umweg, Tankkarte und Reichweite eingerechnet.',
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          background:
            'radial-gradient(120% 120% at 0% 0%, #1b3a8f 0%, #0a0f1d 55%, #05070f 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div
            style={{
              width: '84px',
              height: '84px',
              borderRadius: '24px',
              background: 'linear-gradient(135deg, #2575EA 0%, #4f9bff 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '48px',
              fontWeight: 800,
              boxShadow: '0 20px 60px rgba(37,117,234,0.5)',
            }}
          >
            ⛽
          </div>
          <div style={{ fontSize: '52px', fontWeight: 800, letterSpacing: '-1px' }}>
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              fontSize: '72px',
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-2px',
              maxWidth: '1000px',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: '32px', color: '#9fb4d8', maxWidth: '900px', lineHeight: 1.3 }}>
            {subtitle}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '28px',
            color: '#6f86b0',
          }}
        >
          <span style={{ color: '#4f9bff', fontWeight: 700 }}>fuelyn.app</span>
          <span>·</span>
          <span>AI Fuel Intelligence</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
