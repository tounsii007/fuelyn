// ============================================================
// PriceReportForm — anonymous "this price is wrong" submission
//
// Lives on the station-detail page. Users tap a small "Preis
// korrigieren" link; a form drops down with:
//   * fuel-type picker (defaulting to the user's preferred fuel)
//   * price input (validated client-side against the same range
//     as the BFF, so we don't bother the server with obvious
//     typos)
//   * optional "I just paid" timestamp (defaults to now)
//   * a submit button that POSTs /api/prices/report
//
// On success the user gets a thank-you toast with the engine's
// classification ("Match · Danke" vs "Korrektur erfasst"); on
// error the toast surfaces the rejection reason in plain
// language.
// ============================================================

'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useToast } from '@/components/ui/Toast';
import { useAppStore } from '@/lib/store/app-store';
import {
  MIN_PLAUSIBLE_PRICE,
  MAX_PLAUSIBLE_PRICE,
  type FuelType,
  type ParsedPumpDisplay,
} from '@fuelyn/core';
import dynamic from 'next/dynamic';

// Lazy: the pump-photo flow + its tesseract.js dep should never
// enter the initial bundle. The form mounts; the capture button
// is the trigger that finally requests this chunk.
const PumpPhotoCapture = dynamic(
  () => import('./PumpPhotoCapture').then((m) => ({ default: m.PumpPhotoCapture })),
  { ssr: false },
);

export interface PriceReportFormProps {
  stationId: string;
  /**
   * Iter AH: kept on the prop for callsite compatibility, but
   * NO LONGER sent to the BFF. The server fetches the upstream
   * price itself — accepting it from the client was a spoof
   * vector that let attackers force matches-known classification.
   */
  knownPrices?: Partial<Record<FuelType, number | null>>;
}

interface ReportResponse {
  success?: boolean;
  classification?: string;
  confidence?: number;
  deltaEurPerL?: number;
  error?: string;
  rejection?: string;
  retryAfterSeconds?: number;
}

const FUEL_LABELS: Record<FuelType, string> = {
  diesel: 'Diesel',
  e5: 'Super E5',
  e10: 'Super E10',
};

export function PriceReportForm({ stationId }: PriceReportFormProps) {
  const { t } = useTranslations();
  const toast = useToast();
  const defaultFuel = useAppStore((s) => s.filter.fuelType);

  const [open, setOpen] = useState(false);
  const [fuelType, setFuelType] = useState<FuelType>(defaultFuel);
  const [priceInput, setPriceInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [photoVerified, setPhotoVerified] = useState(false);

  const reset = () => {
    setPriceInput('');
    setSubmitting(false);
    setPhotoVerified(false);
  };

  /**
   * Hook the pump-display OCR result into the form. We deliberately
   * never auto-submit — the user always confirms what the camera read,
   * even when confidence is high, so a misread can't generate spam.
   */
  const onPhotoResult = useCallback(
    (parsed: ParsedPumpDisplay) => {
      if (parsed.fuelType) setFuelType(parsed.fuelType);
      if (parsed.pricePerLiter != null) {
        setPriceInput(
          parsed.pricePerLiter.toFixed(3).replace(/0+$/, '').replace(/\.$/, '').replace('.', ','),
        );
      }
      setPhotoVerified(parsed.confidence >= 0.7);
      if (parsed.pricePerLiter == null) {
        toast.show({
          tone: 'warning',
          title: t('pumpPhoto.unreadableTitle'),
          description: t('pumpPhoto.unreadableDesc'),
        });
      } else {
        toast.show({
          tone: 'success',
          title: t('pumpPhoto.readTitle'),
          description: t('pumpPhoto.readDesc')
            .replace('{price}', String(parsed.pricePerLiter))
            .replace('{percent}', String(Math.round(parsed.confidence * 100))),
        });
      }
    },
    [t, toast],
  );

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const price = Number(priceInput.replace(',', '.'));
    if (!Number.isFinite(price) || price < MIN_PLAUSIBLE_PRICE || price > MAX_PLAUSIBLE_PRICE) {
      toast.show({
        tone: 'warning',
        title: t('priceReport.invalidPriceTitle'),
        description: t('priceReport.invalidPriceDesc')
          .replace('{min}', String(MIN_PLAUSIBLE_PRICE))
          .replace('{max}', String(MAX_PLAUSIBLE_PRICE)),
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/prices/report', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Fuelyn-Csrf': '1',
        },
        // Iter AH: knownPrice + photoVerified removed from the
        // request — both were spoofable. The server now looks up
        // the upstream price itself; photoVerified will return
        // once a signed-OCR endpoint exists.
        body: JSON.stringify({ stationId, fuelType, price }),
      });
      const data: ReportResponse = await res.json().catch(() => ({}));

      if (res.status === 429) {
        toast.show({
          tone: 'warning',
          title: t('priceReport.rateLimitedTitle'),
          description: t('priceReport.rateLimitedDesc').replace(
            '{seconds}',
            String(data.retryAfterSeconds ?? 300),
          ),
        });
        return;
      }

      if (!res.ok || !data.success) {
        toast.show({
          tone: 'danger',
          title: t('priceReport.errorTitle'),
          description:
            (data.rejection && t(`priceReport.rejection.${data.rejection}`)) ||
            data.error ||
            t('priceReport.errorGeneric'),
        });
        return;
      }

      const classKey = data.classification ?? 'no-known-price';
      toast.show({
        tone: 'success',
        title: t('priceReport.successTitle'),
        description: t(`priceReport.classification.${classKey}`),
      });
      setOpen(false);
      reset();
    } catch (err) {
      toast.show({
        tone: 'danger',
        title: t('priceReport.errorTitle'),
        description: err instanceof Error ? err.message : t('priceReport.errorGeneric'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-[var(--color-fg-subtle)] underline-offset-2 hover:underline hover:text-[var(--color-fg)] transition-colors"
      >
        {t('priceReport.cta')}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)]/40 p-3 space-y-3"
      aria-label={t('priceReport.formAria')}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--color-fg)]">
          {t('priceReport.title')}
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] text-sm"
          aria-label={t('priceReport.closeAria')}
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(['diesel', 'e5', 'e10'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFuelType(f)}
            className={`rounded-lg px-2 py-1.5 text-xs font-medium border transition-colors
                       ${fuelType === f
                         ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 text-[var(--color-brand-600)]'
                         : 'border-[var(--color-border)] text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-hover)]'}`}
          >
            {FUEL_LABELS[f]}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="block text-xs text-[var(--color-fg-subtle)] mb-1">
          {t('priceReport.priceLabel')}
        </span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="1,749"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm tabular-nums
                       focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/40"
            required
          />
          <span className="text-xs text-[var(--color-fg-subtle)]">€/L</span>
        </div>
      </label>

      <div className="flex items-center justify-between gap-2">
        <PumpPhotoCapture onResult={onPhotoResult} />
        {photoVerified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-100)]
                           text-[var(--color-success-700)] dark:bg-[var(--color-success-900)]/40
                           dark:text-[var(--color-success-300)] px-2 py-0.5 text-[11px] font-medium">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t('priceReport.verifiedBadge')}
          </span>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting || !priceInput.trim()}
        className="w-full rounded-lg bg-[var(--color-brand-500)] text-white px-3 py-2 text-sm font-medium
                   hover:bg-[var(--color-brand-600)] disabled:opacity-50 transition-colors"
      >
        {submitting ? t('priceReport.submitting') : t('priceReport.submit')}
      </button>

      <p className="text-[10px] text-[var(--color-fg-subtle)]">
        {t('priceReport.privacyHint')}
      </p>
    </form>
  );
}
