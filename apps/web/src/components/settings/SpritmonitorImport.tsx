// ============================================================
// SpritmonitorImport — Drop-in CSV importer for Spritmonitor.de
//
// Shown in /settings under the "Daten" section. Lets the user
// pick a CSV they exported from spritmonitor.de or .com and
// merges the rows into the Zustand fuel-log store.
//
// Behaviour:
//   - File picker accepts .csv only
//   - Parsing is synchronous + pure (uses parseSpritmonitorCsv
//     from @fuelyn/core), so no network call needed
//   - Result preview shows: imported / skipped count + a
//     collapsible list of skipped rows (for debugging)
//   - Confirm-before-merge to avoid accidental dupes
//   - De-duplication: rows with the same date + liters +
//     stationName as an existing entry are silently skipped
//     (Spritmonitor doesn't expose stable IDs we could match on)
// ============================================================

'use client';

import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  parseSpritmonitorCsv,
  type SpritmonitorImportResult,
  type FuelLogEntry,
} from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useToast } from '@/components/ui/Toast';
import { useTranslations } from '@/lib/hooks/use-translations';

interface PreviewState {
  fileName: string;
  result: SpritmonitorImportResult;
  fresh: FuelLogEntry[];     // those that survived dedup
  duplicates: number;        // count silently dropped as dupes
}

export function SpritmonitorImport() {
  const { t } = useTranslations();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const fuelLog = useAppStore((s) => s.fuelLog);
  const setFuelLog = useAppStore((s) => s.setFuelLog);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Build a quick-lookup set of "date|liters|station" tuples
   * from the existing log so we can drop dupes in O(n+m). Day-
   * resolution + liters + station is the most discriminating
   * triple Spritmonitor exposes.
   */
  const dedupKey = useCallback((e: FuelLogEntry): string => {
    const day = e.date.slice(0, 10);
    const liters = Math.round(e.liters * 100) / 100;
    return `${day}|${liters}|${e.stationName.toLowerCase()}`;
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const text = await file.text();
        const result = parseSpritmonitorCsv(text);
        const existingKeys = new Set(fuelLog.map(dedupKey));
        const fresh = result.entries.filter((e) => !existingKeys.has(dedupKey(e)));
        const duplicates = result.entries.length - fresh.length;
        setPreview({ fileName: file.name, result, fresh, duplicates });
      } catch (err) {
        toast.show({
          tone: 'danger',
          title: t('spritmonitor.errorTitle'),
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setBusy(false);
      }
    },
    [fuelLog, dedupKey, toast, t],
  );

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    e.target.value = '';
  };

  const confirmImport = () => {
    if (!preview) return;
    // Merge fresh entries into the store; the existing entries
    // stay where they are. Sort by date desc so newest is first.
    const merged = [...fuelLog, ...preview.fresh].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
    setFuelLog(merged);
    toast.show({
      tone: 'success',
      title: t('spritmonitor.successTitle'),
      description: t('spritmonitor.successDesc')
        .replace('{imported}', String(preview.fresh.length))
        .replace('{duplicates}', String(preview.duplicates))
        .replace('{skipped}', String(preview.result.skipped.length)),
    });
    setPreview(null);
  };

  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-3 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-fg)]">
            {t('spritmonitor.title')}
          </p>
          <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">
            {t('spritmonitor.desc')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold
                     bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)]
                     disabled:opacity-60 transition-colors"
        >
          {busy ? t('spritmonitor.busyCta') : t('spritmonitor.cta')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onChange}
          className="sr-only"
          aria-label={t('spritmonitor.pickAria')}
        />
      </div>

      {preview && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs space-y-2"
        >
          <p className="font-semibold text-[var(--color-fg)]">{preview.fileName}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat
              label={t('spritmonitor.statImported')}
              value={preview.fresh.length}
              tone="success"
            />
            <Stat
              label={t('spritmonitor.statDuplicates')}
              value={preview.duplicates}
              tone="neutral"
            />
            <Stat
              label={t('spritmonitor.statSkipped')}
              value={preview.result.skipped.length}
              tone="warning"
            />
          </div>
          {preview.result.skipped.length > 0 && (
            <details className="text-[var(--color-fg-subtle)]">
              <summary className="cursor-pointer hover:text-[var(--color-fg)]">
                {t('spritmonitor.showSkipped')}
              </summary>
              <ul className="mt-1 max-h-32 overflow-y-auto space-y-1 pl-3">
                {preview.result.skipped.slice(0, 20).map((s, i) => (
                  <li key={i} className="font-mono text-[10px]">
                    {t('spritmonitor.row')} {s.rowNumber}: {s.reason}
                  </li>
                ))}
                {preview.result.skipped.length > 20 && (
                  <li className="text-[10px]">
                    …{t('spritmonitor.andMore').replace('{n}', String(preview.result.skipped.length - 20))}
                  </li>
                )}
              </ul>
            </details>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold
                         bg-[var(--color-bg-subtle)] text-[var(--color-fg)]
                         hover:bg-[var(--color-surface-hover)]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={confirmImport}
              disabled={preview.fresh.length === 0}
              className="flex-[2] py-1.5 rounded-lg text-xs font-semibold
                         bg-[var(--color-brand-600)] text-white
                         hover:bg-[var(--color-brand-700)]
                         disabled:opacity-50"
            >
              {t('spritmonitor.confirmCta').replace('{n}', String(preview.fresh.length))}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'neutral';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'warning'
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-[var(--color-fg-subtle)]';
  return (
    <div>
      <p className={`text-base font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">{label}</p>
    </div>
  );
}
