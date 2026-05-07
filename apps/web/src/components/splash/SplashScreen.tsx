// ============================================================
// SplashScreen — Dynamic animated intro screen
// ============================================================

'use client';

import { useState, useEffect, useCallback } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

const TITLE = 'Fuelyn';

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'enter' | 'active' | 'exit' | 'done'>('enter');

  const finish = useCallback(() => {
    setPhase('done');
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('active'), 50);
    const t2 = setTimeout(() => setPhase('exit'), 2400);
    const t3 = setTimeout(finish, 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [finish]);

  if (phase === 'done') return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden transition-all duration-600
        ${phase === 'exit' ? 'opacity-0 scale-105' : 'opacity-100 scale-100'}`}
      style={{
        // Cinematic Fuelyn navy → electric blue → violet — premium feel
        background:
          'radial-gradient(ellipse 80% 60% at 30% 20%, #1a3a6b 0%, transparent 50%),' +
          'radial-gradient(ellipse 60% 50% at 80% 90%, #4a1f6b 0%, transparent 60%),' +
          'linear-gradient(160deg, #050a18 0%, #0a1230 35%, #0f1f3d 70%, #1a2a55 100%)',
      }}
    >
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="splash-particle absolute rounded-full"
            style={{
              width: `${60 + i * 40}px`,
              height: `${60 + i * 40}px`,
              left: `${10 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
              background: `radial-gradient(circle, rgba(37,117,234,${0.08 + i * 0.02}) 0%, transparent 70%)`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>

      {/* Glow ring behind icon */}
      <div
        className={`absolute transition-all duration-1000 ease-out rounded-full
          ${phase === 'active' || phase === 'exit' ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
        style={{
          width: 200,
          height: 200,
          background: 'radial-gradient(circle, rgba(37,117,234,0.15) 0%, rgba(37,117,234,0.05) 40%, transparent 70%)',
          filter: 'blur(20px)',
          transitionDelay: '200ms',
        }}
      />

      {/* Icon */}
      <div
        className={`relative transition-all duration-700 ease-out
          ${phase === 'active' || phase === 'exit' ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-75'}`}
        style={{ transitionDelay: '100ms' }}
      >
        <div className="splash-icon-container relative">
          {/* Pulsing ring */}
          <div className="splash-pulse-ring absolute inset-[-12px] rounded-3xl" />

          {/* Main icon box */}
          <div
            className="relative w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl"
            style={{
              // Brand → violet diagonal so the mark reads as "intelligent"
              background: 'linear-gradient(135deg, #2c8eff 0%, #2575EA 35%, #5b3eff 100%)',
              boxShadow:
                '0 0 0 1px rgba(96,181,250,0.35), 0 8px 32px rgba(37,117,234,0.55), 0 0 80px rgba(91,62,255,0.25)',
            }}
          >
            {/* Fuelyn drop + lightning F mark */}
            <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2.5c4.6 5.5 7 9.4 7 12.6a7 7 0 11-14 0c0-3.2 2.4-7.1 7-12.6Z"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinejoin="round"
                className="splash-draw"
              />
              <path
                d="M11 9h3.2l-3 3.6h2.4L10.4 18l.8-3.8H9.6L11 9Z"
                fill="currentColor"
                className="splash-fade-in"
                style={{ animationDelay: '0.5s' }}
              />
            </svg>

            {/* Shine effect */}
            <div className="splash-shine absolute inset-0 rounded-2xl overflow-hidden" />
          </div>
        </div>
      </div>

      {/* Title — staggered letters; "Fuel" in white, "yn" in cyan/violet */}
      <div className="mt-8 flex items-baseline gap-[2px]">
        {TITLE.split('').map((char, i) => (
          <span
            key={i}
            className={`splash-letter text-4xl font-bold tracking-tight
              ${phase === 'active' || phase === 'exit' ? 'splash-letter-visible' : ''}`}
            style={{
              animationDelay: `${400 + i * 60}ms`,
              color: i < 4 ? '#ffffff' : '#7cb6ff',
              textShadow: i >= 4 ? '0 0 28px rgba(124,182,255,0.6)' : undefined,
            }}
          >
            {char}
          </span>
        ))}
      </div>

      {/* Subtitle */}
      <p
        className={`mt-3 text-sm tracking-[0.18em] uppercase font-medium transition-all duration-700 ease-out
          ${phase === 'active' || phase === 'exit' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        style={{
          color: 'rgba(148, 163, 184, 0.7)',
          transitionDelay: '900ms',
        }}
      >
        AI fuel intelligence
      </p>

      {/* Loading bar */}
      <div
        className={`mt-10 transition-all duration-500 ease-out
          ${phase === 'active' || phase === 'exit' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        style={{ transitionDelay: '1100ms' }}
      >
        <div className="w-48 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(37,117,234,0.15)' }}>
          <div className="splash-progress h-full rounded-full" style={{ background: 'linear-gradient(90deg, #2575EA, #60b5fa)' }} />
        </div>
      </div>

      {/* Bottom branding */}
      <div
        className={`absolute bottom-8 transition-all duration-500
          ${phase === 'active' || phase === 'exit' ? 'opacity-60' : 'opacity-0'}`}
        style={{ transitionDelay: '1200ms' }}
      >
        <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(148,163,184,0.5)' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-reach-safe" style={{ boxShadow: '0 0 6px rgba(16,185,129,0.4)' }} />
          Echtzeit-Preise
        </div>
      </div>
    </div>
  );
}
