// ============================================================
// "Save to Wallet" button
//
// Tap → posts the current station snapshot to /api/wallet-pass,
// downloads the JSON payload, and offers it to the user as a
// one-time pass file. Until the backend has wallet-signing keys
// wired up, this still gives the user something concrete:
// a downloadable JSON they can preview / archive / keep.
//
// On platforms that DO have wallet support and signed passes
// available (future iter), the same fetch returns the signed
// .pkpass / Google Wallet JWT instead, and the click triggers
// the native "Add to Wallet" flow.
// ============================================================

'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useToast } from '@/components/ui/Toast';
import { useAppStore } from '@/lib/store/app-store';

export interface WalletPassButtonProps {
  stationId: string;
  stationLabel: string;
  cityLine?: string;
  fuelLabel: string;
  priceEurPerL: string;
  distanceLabel?: string;
}

export function WalletPassButton(props: WalletPassButtonProps) {
  const { t, locale } = useTranslations();
  const toast = useToast();
  const baseUrl = useAppStore((s) => s.settings); // settings carries the public origin via Next env, but we'll just use window
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    setLoading(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://fuelyn.app';
      const res = await fetch('/api/wallet-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...props,
          locale,
          deepLink: `${origin}/station/${encodeURIComponent(props.stationId)}?source=wallet`,
        }),
      });
      if (!res.ok) {
        toast.show({
          tone: 'danger',
          title: t('walletPass.errorTitle'),
          description: `HTTP ${res.status}`,
        });
        return;
      }
      const json = await res.json();
      // Download as JSON for now — the eventual signed .pkpass /
      // Google Wallet redirect flow swaps this branch out.
      const blob = new Blob([JSON.stringify(json, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fuelyn-pass-${props.stationId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.show({
        tone: 'success',
        title: t('walletPass.successTitle'),
        description: t('walletPass.successDesc'),
      });
    } catch (err) {
      toast.show({
        tone: 'danger',
        title: t('walletPass.errorTitle'),
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [props, t, toast, locale]);

  // baseUrl reference is only there to keep React-style linting
  // happy in case we later need the configured origin from settings.
  void baseUrl;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)]
                 bg-[var(--color-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-fg)]
                 hover:bg-[var(--color-surface-hover)] disabled:opacity-50 transition-colors"
      aria-label={t('walletPass.cta')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
      {loading ? t('walletPass.loading') : t('walletPass.cta')}
    </button>
  );
}
