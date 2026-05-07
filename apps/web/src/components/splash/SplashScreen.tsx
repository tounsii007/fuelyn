// ============================================================
// SplashScreen — Dynamic animated intro screen
// ============================================================

'use client';

import { useState, useEffect, useCallback } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

const TITLE = 'TankPilot';

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
        background: 'linear-gradient(145deg, #0a1628 0%, #0f1f3d 30%, #142952 60%, #1a3a6b 100%)',
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
              background: 'linear-gradient(135deg, #2575EA 0%, #1a5bc4 50%, #1e4dae 100%)',
              boxShadow: '0 8px 32px rgba(37,117,234,0.4), 0 0 60px rgba(37,117,234,0.15)',
            }}
          >
            {/* Fuel pump SVG */}
            <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 22V6a2 2 0 012-2h8a2 2 0 012 2v16"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                className="splash-draw"
              />
              <path
                d="M3 22h12"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                className="splash-draw"
                style={{ animationDelay: '0.3s' }}
              />
              <rect
                x="6"
                y="8"
                width="6"
                height="4"
                rx="0.5"
                stroke="currentColor"
                strokeWidth={1.5}
                className="splash-draw"
                style={{ animationDelay: '0.5s' }}
              />
              <path
                d="M15 10h1.5a2.5 2.5 0 012.5 2.5v5a1.5 1.5 0 003 0V10l-3-4"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="splash-draw"
                style={{ animationDelay: '0.6s' }}
              />
              <circle
                cx="19"
                cy="6"
                r="1"
                fill="currentColor"
                className="splash-fade-in"
                style={{ animationDelay: '1s' }}
              />
            </svg>

            {/* Shine effect */}
            <div className="splash-shine absolute inset-0 rounded-2xl overflow-hidden" />
          </div>
        </div>
      </div>

      {/* Title — staggered letters */}
      <div className="mt-8 flex items-baseline gap-[2px]">
        {TITLE.split('').map((char, i) => (
          <span
            key={i}
            className={`splash-letter text-3xl font-bold tracking-tight
              ${phase === 'active' || phase === 'exit' ? 'splash-letter-visible' : ''}`}
            style={{
              animationDelay: `${400 + i * 60}ms`,
              color: i < 4 ? '#ffffff' : '#60b5fa',
            }}
          >
            {char}
          </span>
        ))}
      </div>

      {/* Subtitle */}
      <p
        className={`mt-3 text-sm tracking-wide transition-all duration-700 ease-out
          ${phase === 'active' || phase === 'exit' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        style={{
          color: 'rgba(148, 163, 184, 0.8)',
          transitionDelay: '900ms',
        }}
      >
        G&uuml;nstig &amp; schlau tanken
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
