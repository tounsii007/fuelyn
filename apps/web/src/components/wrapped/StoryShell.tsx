// ============================================================
// StoryShell — Spotify-Wrapped-style story player.
//
// Features:
//   • Tap left/right to navigate, ←/→ keys, swipe on touch
//   • Auto-advance with progress bars at the top (pausable)
//   • Prefers-reduced-motion: disables auto-advance
//   • Glass + gradient mesh background (uses tokens.css)
//   • Share button (Web Share API + clipboard fallback)
//   • Esc closes the story
//
// Each slide is rendered fullscreen and can opt-out of auto-advance
// by setting `pauseAutoAdvance` on the slide descriptor.
// ============================================================

'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface StorySlide {
  readonly id: string;
  readonly node: ReactNode;
  /** ms before auto-advance fires; default 6000 */
  readonly durationMs?: number;
  readonly pauseAutoAdvance?: boolean;
}

export interface StoryShellProps {
  readonly slides: ReadonlyArray<StorySlide>;
  readonly title: string;
  readonly subtitle?: string;
  readonly onClose?: () => void;
  /** Optional callback for the Teilen-button. */
  readonly onShare?: (currentSlideId: string) => void | Promise<void>;
}

const DEFAULT_DURATION = 6000;

export function StoryShell({
  slides,
  title,
  subtitle,
  onClose,
  onShare,
}: StoryShellProps) {
  const { t } = useTranslations();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const startTsRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  const slide = slides[index];
  const duration = slide?.durationMs ?? DEFAULT_DURATION;
  const autoAdvance = !reducedMotion && !slide?.pauseAutoAdvance;

  const close = useCallback(() => {
    if (onClose) onClose();
    else router.back();
  }, [onClose, router]);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= slides.length - 1) {
        close();
        return i;
      }
      return i + 1;
    });
  }, [slides.length, close]);

  const prev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  // Reset progress when slide or pause state changes
  useEffect(() => {
    setProgress(0);
    startTsRef.current = performance.now();
  }, [index, paused]);

  // RAF-driven progress for the active slide
  useEffect(() => {
    if (!autoAdvance || paused) return;

    let cancelled = false;
    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = now - startTsRef.current;
      const ratio = Math.min(1, elapsed / duration);
      setProgress(ratio);
      if (ratio >= 1) {
        next();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [duration, autoAdvance, paused, next]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, close]);

  // Touch swipe
  const touchRef = useRef<{ x: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    setPaused(true);
    const t = e.touches[0];
    if (t) touchRef.current = { x: t.clientX, t: performance.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    setPaused(false);
    const t = e.changedTouches[0];
    const start = touchRef.current;
    if (!t || !start) return;
    const dx = t.clientX - start.x;
    const dt = performance.now() - start.t;
    if (Math.abs(dx) > 40 && dt < 600) {
      if (dx > 0) prev();
      else next();
    }
    touchRef.current = null;
  };

  const handleShare = async () => {
    if (!slide) return;
    if (onShare) {
      await onShare(slide.id);
      return;
    }
    const shareData = {
      title,
      text: `${title} – ${subtitle ?? ''}`,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    };
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share(shareData);
      } else if (typeof navigator !== 'undefined' && 'clipboard' in navigator) {
        const nav = navigator as Navigator & { clipboard: Clipboard };
        await nav.clipboard.writeText(`${title} ${shareData.url ?? ''}`);
      }
    } catch {
      // user cancelled — silent
    }
  };

  if (!slide) return null;

  return (
    <div
      className="fixed inset-0 z-[90] fy-mesh fy-mesh-animated overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={() => setPaused(true)}
      onMouseUp={() => setPaused(false)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top: progress bars */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center gap-1 px-4 pt-3 safe-top"
        aria-hidden="true"
      >
        {slides.map((_, i) => (
          <div
            key={i}
            className="flex-1 h-[3px] rounded-full bg-white/25 overflow-hidden backdrop-blur-sm"
          >
            <div
              className="h-full bg-white rounded-full transition-[width] duration-100 ease-linear"
              style={{
                width:
                  i < index
                    ? '100%'
                    : i === index
                      ? `${progress * 100}%`
                      : '0%',
              }}
            />
          </div>
        ))}
      </div>

      {/* Top-right: title + close */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 safe-top">
        <button
          type="button"
          onClick={handleShare}
          aria-label={t('wrapped.shareLabel')}
          className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md
                     text-white grid place-items-center fy-press"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={close}
          aria-label={t('wrapped.closeLabel')}
          className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md
                     text-white grid place-items-center fy-press"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tap zones */}
      <button
        type="button"
        aria-label={t('wrapped.prevSlide')}
        onClick={prev}
        className="absolute left-0 top-0 bottom-0 w-1/3 z-[5]"
      />
      <button
        type="button"
        aria-label={t('wrapped.nextSlide')}
        onClick={next}
        className="absolute right-0 top-0 bottom-0 w-2/3 z-[5]"
      />

      {/* Slide */}
      <div
        key={slide.id}
        className="absolute inset-0 flex items-center justify-center p-6 z-[2]"
        style={{ animation: 'fy-enter 350ms var(--ease-spring) both' }}
      >
        {slide.node}
      </div>
    </div>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}
