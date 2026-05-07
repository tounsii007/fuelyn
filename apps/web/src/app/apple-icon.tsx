import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #2575EA 0%, #1a5bc4 100%)',
          borderRadius: 38,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <div
            style={{
              width: 80,
              height: 96,
              background: 'rgba(255,255,255,0.95)',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              position: 'relative',
            }}
          >
            <div
              style={{
                width: 56,
                height: 30,
                background: 'rgba(37,117,234,0.12)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: '#2575EA',
                  fontFamily: 'system-ui',
                }}
              >
                1.65
              </span>
            </div>
            <div
              style={{
                width: 22,
                height: 22,
                background: '#F59E0B',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
              }}
            >
              <svg viewBox="0 0 20 20" width="12" height="12" fill="currentColor" aria-hidden="true">
                <path d="M10 1.5l2.224 4.507 4.974.723-3.6 3.509.85 4.953L10 13.523l-4.448 2.339.85-4.953-3.6-3.509 4.974-.723L10 1.5z" />
              </svg>
            </div>
          </div>
          <div
            style={{
              width: 96,
              height: 6,
              background: 'rgba(255,255,255,0.3)',
              borderRadius: 3,
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
