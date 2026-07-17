// ============================================================
// Dynamic OpenGraph / social-share image (Iteration 1 — SEO).
//
// Rendered by next/og at build/request time into a 1200×630 PNG,
// served at /opengraph-image and referenced automatically by the
// root metadata. A single branded card keeps every shared link
// looking intentional instead of a blank thumbnail.
// ============================================================

import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/seo/site';

export const alt = 'Fuelyn — AI-powered fuel intelligence';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
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
              fontSize: '76px',
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-2px',
              maxWidth: '900px',
            }}
          >
            Günstig & schlau tanken.
          </div>
          <div style={{ fontSize: '34px', color: '#9fb4d8', maxWidth: '860px', lineHeight: 1.3 }}>
            Die klügste Tankstelle finden. Preis-Tiefpunkte vorhersagen. Bei jedem Tankstopp sparen.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '28px', color: '#6f86b0' }}>
          <span style={{ color: '#4f9bff', fontWeight: 700 }}>fuelyn.app</span>
          <span>·</span>
          <span>AI Fuel Intelligence</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
