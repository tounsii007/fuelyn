// ============================================================
// BankCsvImport — Open-Banking CSV → fuel-log candidates.
//
// Sister of SpritmonitorImport. The user picks a CSV they
// exported from their online banking (DKB, Sparkasse, ING, N26,
// Comdirect …) and we extract the rows that look like fuel-
// station transactions. Date, merchant, and total cost come
// from the bank line; litres / €/L / fuel-grade are not in the
// banking data so we leave those for the user to fill via the
// existing fuel-log form (one tap per row).
//
// Behaviour
//   * File picker accepts .csv only
//   * Parsing is sync + pure — no network call
//   * Preview shows the rows + a "merge into log" CTA. Each row
//     gets a stub FuelLogEntry with default fuel = the user's
//     preferred fuel and litres = 0. Users can edit any row
//     after import.
//   * De-duplication: rows with the same date + amount + brand
//     as an existing fuel-log entry are silently dropped.
// ============================================================

'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  parseBankCsv,
  type BankImportResult,
  type FuelLogEntry,
} from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useToast } from '@/components/ui/Toast';
import { useTranslations } from '@/lib/hooks/use-translations';

interface PreviewState {
  fileName: string;
  result: BankImportResult;
  fresh: FuelLogEntry[];
  duplicates: number;
}

export function BankCsvImport() {
  const { t } = useTranslations();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const fuelLog = useAppStore((s) => s.fuelLog);
  const setFuelLog = useAppStore((s) => s.setFuelLog);
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);

  const dedupKey = useCallback((e: FuelLogEntry): string => {
    const day = e.date.slice(0, 10);
    const cents = Math.round(e.totalCost * 100);
    return `${day}|${cents}|${e.stationBrand.toLowerCase()}`;
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const text = await file.text();
        const result = parseBankCsv(text);

        // Convert each bank row into a stub FuelLogEntry. liters and
        // pricePerLiter remain 0 (the user fills them in afterwards).
        const candidates: FuelLogEntry[] = result.rows.map((r, idx) => ({
          id: `bank-${file.name}-${idx}-${Date.now()}`,
          date: r.date,
          stationName: r.merchantDisplay,
          stationBrand: r.stationBrand,
          fuelType,
          liters: 0,
          pricePerLiter: 0,
          totalCost: r.totalCost,
        }));

        const existingKeys = new Set(fuelLog.map(dedupKey));
        const fresh = candidates.filter((e) => !existingKeys.has(dedupKey(e)));
        const duplicates = candidates.length - fresh.length;
        setPreview({ fileName: file.name, result, fresh, duplicates });
      } catch (err) {
        toast.show({
          tone: 'danger',
          title: t('bankImport.errorTitle'),
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setBusy(false);
      }
    },
    [fuelLog, fuelType, dedupKey, toast, t],
  );

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    e.target.value = '';
  };

  const confirmImport = () => {
    if (!preview) return;
    const merged = [...fuelLog, ...preview.fresh].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
    setFuelLog(merged);
    toast.show({
      tone: 'success',
      title: t('bankImport.successTitle'),
      description: t('bankImport.successDesc')
        .replace('{imported}', String(preview.fresh.length))
        .replace('{duplicates}', String(preview.duplicates))
        .replace('{scanned}', String(preview.result.totalRowsScanned)),
    });
    setPreview(null);
  };

  const bankLabel = useMemo(() => {
    if (!preview) return '';
    return preview.result.bank === 'unknown'
      ? t('bankImport.bankUnknown')
      : preview.result.bank.toUpperCase();
  }, [preview, t]);

  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {t('bankImport.title')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('bankImport.desc')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700
                     bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium
                     text-gray-700 dark:text-gray-200
                     hover:bg-gray-50 dark:hover:bg-gray-800
                     disabled:opacity-50 transition-colors"
        >
          {busy ? t('bankImport.busyCta') : t('bankImport.cta')}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onChange}
        className="sr-only"
        aria-label={t('bankImport.pickAria')}
      />

      {preview && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-gray-500">{t('bankImport.statBank')}</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {bankLabel}
              </p>
            </div>
            <div>
              <p className="text-gray-500">{t('bankImport.statFound')}</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {preview.fresh.length}
              </p>
            </div>
            <div>
              <p className="text-gray-500">{t('bankImport.statDuplicates')}</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {preview.duplicates}
              </p>
            </div>
          </div>

          {preview.fresh.length > 0 && (
            <ul className="max-h-48 overflow-y-auto text-xs space-y-1">
              {preview.fresh.slice(0, 12).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between rounded-md bg-white dark:bg-gray-900 px-2 py-1"
                >
                  <span className="text-gray-700 dark:text-gray-200 truncate">
                    {row.date} · {row.stationBrand}
                  </span>
                  <span className="font-mono tabular-nums text-gray-900 dark:text-gray-100">
                    {row.totalCost.toFixed(2)} €
                  </span>
                </li>
              ))}
              {preview.fresh.length > 12 && (
                <li className="text-center text-gray-500">
                  {t('bankImport.andMore').replace('{n}', String(preview.fresh.length - 12))}
                </li>
              )}
            </ul>
          )}

          <button
            type="button"
            onClick={confirmImport}
            disabled={preview.fresh.length === 0}
            className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium py-1.5 disabled:opacity-50"
          >
            {t('bankImport.confirmCta').replace('{n}', String(preview.fresh.length))}
          </button>
        </div>
      )}
    </div>
  );
}
