// ============================================================
// ReportPriceDialog — modal that lets the user submit a
// price-correction report to the backend.
//
// Phase 8 frontend wire-up. Replaces the previous mailto MVP.
// Visual: glass overlay, brand-accented submit button, minimal
// fields (only the corrected price + an optional note).
// ============================================================

'use client';

import { useState } from 'react';
import { fetchJson } from '@/lib/http/fetch-json';

interface ReportPriceDialogProps {
  open: boolean;
  onClose: () => void;
  stationId: string;
  stationName: string;
  fuelType: 'diesel' | 'e5' | 'e10';
  /** What the app currently shows for this station/fuel — included so the
      backend can record the drift. Optional (the user might be reporting
      a station with no listed price). */
  displayedPrice?: number | null;
}

export function ReportPriceDialog({
  open,
  onClose,
  stationId,
  stationName,
  fuelType,
  displayedPrice,
}: ReportPriceDialogProps) {
  const [reportedPrice, setReportedPrice] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = Number(reportedPrice.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 99) {
      setError('Bitte gib einen gültigen Preis zwischen 0 und 99 €/L ein.');
      return;
    }
    setBusy(true);
    try {
      await fetchJson<{ id: number; status: string }>('/api/reports', {
        method: 'POST',
        headers: { 'X-Fuelyn-Csrf': '1' },
        body: {
          stationId,
          fuelType,
          displayedPrice: displayedPrice ?? null,
          reportedPrice: parsed,
          note: note.trim() || undefined,
        },
      });
      setSuccess(true);
      // Auto-close after a short success state.
      setTimeout(onClose, 1800);
    } catch (err) {
      const e = err as Error;
      const msg = e?.message?.includes('429')
        ? 'Zu viele Meldungen — bitte später erneut versuchen.'
        : 'Konnte nicht übermittelt werden. Bitte erneut versuchen.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={busy ? undefined : onClose}
        className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm fy-enter"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 fy-enter
                   w-[min(92vw,420px)] rounded-2xl
                   bg-white dark:bg-[oklch(0.18_0.04_265)]
                   border border-gray-200 dark:border-white/10
                   shadow-[0_20px_60px_rgba(0,0,0,0.30)]"
      >
        {success ? (
          <div className="p-6 text-center fy-enter">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30
                            flex items-center justify-center mb-3">
              <svg className="w-7 h-7 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">Danke!</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Deine Meldung wurde übermittelt. Sie hilft, die Datenqualität für alle zu verbessern.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5">
            <header className="mb-3">
              <h3 id="report-dialog-title" className="text-base font-bold text-gray-900 dark:text-gray-100">
                Preis melden
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {stationName} · {fuelType.toUpperCase()}
                {displayedPrice != null && (
                  <> · angezeigt: <span className="tabular-nums">{displayedPrice.toFixed(3)} €/L</span></>
                )}
              </p>
            </header>

            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
              Tatsächlicher Preis (€/L)
            </label>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={reportedPrice}
              onChange={(e) => setReportedPrice(e.target.value)}
              placeholder="z. B. 1,899"
              disabled={busy}
              className="w-full px-3 py-2.5 rounded-xl text-sm tabular-nums
                         bg-gray-50 dark:bg-white/5
                         border border-gray-200 dark:border-white/10
                         text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-brand-500/40
                         disabled:opacity-60"
            />

            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mt-3 mb-1">
              Notiz (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="z. B. Aufkleber bereits geändert"
              disabled={busy}
              className="w-full px-3 py-2 rounded-xl text-sm
                         bg-gray-50 dark:bg-white/5
                         border border-gray-200 dark:border-white/10
                         text-gray-800 dark:text-gray-200 resize-none
                         focus:outline-none focus:ring-2 focus:ring-brand-500/40
                         disabled:opacity-60"
            />

            {error && (
              <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>
            )}

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300
                           hover:bg-gray-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={busy || !reportedPrice.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white
                           bg-gradient-to-br from-brand-500 to-brand-700
                           shadow-[0_4px_14px_rgba(37,117,234,0.35)]
                           hover:shadow-[0_6px_20px_rgba(37,117,234,0.45)]
                           hover:scale-[1.02] active:scale-[0.98]
                           disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                           transition-all"
              >
                {busy ? 'Sende …' : 'Übermitteln'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
