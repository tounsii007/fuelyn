// ============================================================
// Floating "tap-to-speak" button + listening dialog.
//
// Mounts globally from AppShell. When pressed, opens a modal
// overlay showing the live transcript, the parsed intent, and
// a "Run" button. Routes to the right page or dispatches to
// the store on a confirmed intent.
//
// SSR-safe: renders nothing on the server, then nothing on the
// client until the browser exposes SpeechRecognition (so we
// never break Safari iOS or older Edge).
// ============================================================

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import { useVoiceCommand } from '@/lib/hooks/use-voice-command';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useToast } from '@/components/ui/Toast';
import { useAppStore } from '@/lib/store/app-store';
import { hapticImpact } from '@/lib/native/bridge';
import type { VoiceIntent } from '@fuelyn/core';

export function VoiceCommandButton() {
  const hydrated = useIsHydrated();
  const { t, locale } = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const setFuelType = useAppStore((s) => s.setFuelType);
  const setMapRadiusKm = useAppStore((s) => s.setMapRadiusKm);

  const [open, setOpen] = useState(false);

  const handleIntent = useCallback(
    (intent: VoiceIntent) => {
      // Low confidence → keep the modal open and let the user re-trigger.
      if (intent.intent === 'unknown' || intent.confidence < 0.5) return;
      executeIntent(intent, {
        router,
        setFuelType,
        setMapRadiusKm,
        toast: (msg) => toast.show({ tone: 'success', title: msg }),
      });
      setOpen(false);
    },
    [router, setFuelType, setMapRadiusKm, toast],
  );

  const parserLocale: 'de' | 'en' = locale.startsWith('de') ? 'de' : 'en';
  const speechLang = useMemo(() => mapLocaleToSpeechLang(locale), [locale]);

  const voice = useVoiceCommand({
    lang: speechLang,
    parserLocale,
    onIntent: handleIntent,
  });

  // Stop listening when the modal closes.
  useEffect(() => {
    if (!open) voice.cancel();
  }, [open, voice]);

  // Don't even render the button if the browser doesn't support speech.
  if (!hydrated || !voice.isSupported) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Tactile confirmation on iOS / Android — silent on web.
          void hapticImpact('LIGHT');
          setOpen(true);
          voice.reset();
          voice.start();
        }}
        aria-label={t('voice.openMicAria')}
        title={t('voice.openMicAria')}
        className="fixed z-40 right-4 bottom-20 sm:bottom-6 inline-flex h-12 w-12 items-center justify-center rounded-full
                   bg-[var(--color-brand-500)] text-white shadow-lg shadow-[var(--color-brand-500)]/30
                   hover:bg-[var(--color-brand-600)] active:scale-95 transition-all
                   focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/50"
      >
        <MicIcon />
      </button>

      {open && (
        <VoiceCommandDialog
          status={voice.status}
          transcript={voice.transcript}
          intent={voice.intent}
          error={voice.error}
          onClose={() => setOpen(false)}
          onRestart={() => {
            voice.reset();
            voice.start();
          }}
          onConfirm={() => voice.intent && handleIntent(voice.intent)}
        />
      )}
    </>
  );
}

// -----------------------------------------------------------------
// Dialog
// -----------------------------------------------------------------

interface DialogProps {
  status: ReturnType<typeof useVoiceCommand>['status'];
  transcript: string;
  intent: VoiceIntent | null;
  error: string | null;
  onClose: () => void;
  onRestart: () => void;
  onConfirm: () => void;
}

function VoiceCommandDialog({
  status,
  transcript,
  intent,
  error,
  onClose,
  onRestart,
  onConfirm,
}: DialogProps) {
  const { t } = useTranslations();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const statusLabel =
    status === 'starting' || status === 'listening'
      ? t('voice.listening')
      : status === 'processing'
        ? t('voice.processing')
        : status === 'denied'
          ? t('voice.permissionDenied')
          : status === 'error'
            ? `${t('voice.errorPrefix')}: ${error ?? '?'}`
            : status === 'unsupported'
              ? t('voice.unsupported')
              : t('voice.tapToTalk');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('voice.dialogAria')}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border-subtle)]
                      shadow-xl p-5 sm:m-4">
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-base font-semibold text-[var(--color-fg)]">
            {t('voice.title')}
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label={t('voice.closeAria')}
            className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] p-1 -m-1"
          >
            ×
          </button>
        </div>

        {/* Status / pulsing mic */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full
                       ${status === 'listening' ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-500)]' : 'bg-[var(--color-surface-hover)] text-[var(--color-fg-subtle)]'}`}
          >
            {status === 'listening' && (
              <span className="absolute inset-0 rounded-full bg-[var(--color-brand-500)]/30 animate-ping" />
            )}
            <MicIcon />
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide text-[var(--color-fg-subtle)]">
              {statusLabel}
            </p>
            <p className="text-sm text-[var(--color-fg)] min-h-[1.25rem]">
              {transcript || (status === 'listening' ? '…' : t('voice.hint'))}
            </p>
          </div>
        </div>

        {/* Parsed intent preview */}
        {intent && intent.intent !== 'unknown' && (
          <div className="mb-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)]/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-fg-subtle)] mb-1">
              {t('voice.intentPrefix')}
            </p>
            <p className="text-sm font-medium text-[var(--color-fg)]">
              {t(`voice.intents.${intent.intent}` as const)}
            </p>
            {(intent.slots.fuel || intent.slots.brand || intent.slots.liters || intent.slots.radiusKm) && (
              <p className="text-xs text-[var(--color-fg-subtle)] mt-1">
                {[
                  intent.slots.brand && intent.slots.brand,
                  intent.slots.fuel && intent.slots.fuel.toUpperCase(),
                  intent.slots.liters && `${intent.slots.liters} L`,
                  intent.slots.pricePerLiter && `${intent.slots.pricePerLiter} €/L`,
                  intent.slots.radiusKm && `${intent.slots.radiusKm} km`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRestart}
            disabled={status === 'listening'}
            className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]
                       px-3 py-2.5 text-sm font-medium text-[var(--color-fg)]
                       hover:bg-[var(--color-surface-hover)] disabled:opacity-50 transition-colors"
          >
            {t('voice.restart')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!intent || intent.intent === 'unknown'}
            className="flex-1 rounded-xl bg-[var(--color-brand-500)] text-white
                       px-3 py-2.5 text-sm font-medium
                       hover:bg-[var(--color-brand-600)] disabled:opacity-50 transition-colors"
          >
            {t('voice.run')}
          </button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------
// Intent → side effect
// -----------------------------------------------------------------

interface ExecuteContext {
  router: ReturnType<typeof useRouter>;
  setFuelType: (f: 'diesel' | 'e5' | 'e10') => void;
  setMapRadiusKm: (km: number) => void;
  toast: (message: string) => void;
}

export function executeIntent(intent: VoiceIntent, ctx: ExecuteContext): void {
  switch (intent.intent) {
    case 'find-cheapest': {
      if (intent.slots.fuel) ctx.setFuelType(intent.slots.fuel);
      ctx.router.push('/?source=voice-cheapest');
      break;
    }
    case 'navigate-to-station': {
      if (intent.slots.fuel) ctx.setFuelType(intent.slots.fuel);
      const q = intent.slots.brand ? `&q=${encodeURIComponent(intent.slots.brand)}` : '';
      ctx.router.push(`/?source=voice-navigate${q}`);
      break;
    }
    case 'add-fuel-log': {
      const params = new URLSearchParams({ source: 'voice-log' });
      if (intent.slots.liters) params.set('liters', String(intent.slots.liters));
      if (intent.slots.pricePerLiter) params.set('price', String(intent.slots.pricePerLiter));
      if (intent.slots.fuel) params.set('fuel', intent.slots.fuel);
      ctx.router.push(`/fuel-log?${params.toString()}`);
      break;
    }
    case 'show-fuel-log':
      ctx.router.push('/fuel-log?source=voice');
      break;
    case 'show-stats':
      ctx.router.push('/stats?source=voice');
      break;
    case 'show-achievements':
      ctx.router.push('/achievements?source=voice');
      break;
    case 'open-settings':
      ctx.router.push('/settings?source=voice');
      break;
    case 'switch-fuel':
      if (intent.slots.fuel) {
        ctx.setFuelType(intent.slots.fuel);
        ctx.toast(`${intent.slots.fuel.toUpperCase()} ✓`);
      }
      break;
    case 'set-radius':
      if (intent.slots.radiusKm) {
        ctx.setMapRadiusKm(intent.slots.radiusKm);
        ctx.toast(`${intent.slots.radiusKm} km ✓`);
      }
      break;
    case 'help':
      ctx.toast(intent.locale === 'de' ? 'Tippe das Mikro und sprich.' : 'Tap the mic and speak.');
      break;
    default:
      break;
  }
}

function mapLocaleToSpeechLang(loc: string): string {
  const lc = loc.toLowerCase();
  if (lc.startsWith('de')) return 'de-DE';
  if (lc.startsWith('en-us')) return 'en-US';
  if (lc.startsWith('en')) return 'en-GB';
  if (lc.startsWith('fr')) return 'fr-FR';
  return 'de-DE';
}

// -----------------------------------------------------------------
// Icon
// -----------------------------------------------------------------

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}
