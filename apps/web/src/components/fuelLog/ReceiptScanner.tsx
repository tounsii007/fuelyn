// ============================================================
// ReceiptScanner — file/camera → OCR → parsed fuel-log entry.
//
// Flow:
//   1. User taps "Scan receipt" → file picker opens (with the
//      `capture="environment"` hint so mobile defaults to the
//      rear camera, falls back to the gallery on desktop)
//   2. Selected image goes through Tesseract.js (deu+eng
//      worker, downloaded once and cached) — progress shown
//      as a percentage so the user knows it's working
//   3. Raw OCR text is fed to parseReceipt() from core, which
//      extracts date / brand / fuel / liters / €/L / total
//   4. Parsed result is handed to onResult() — usually the
//      parent /fuel-log page that pre-fills its form
//
// Tesseract is loaded lazily (`await import(…)`) so the
// 4 MB+ wasm bundle isn't paid for by users who never tap
// the scan button. First scan ≈ 5–8 s on a mid-range phone;
// subsequent scans <2 s because the worker stays warm for
// the lifetime of the component.
// ============================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { parseReceipt, type ParsedReceipt } from '@fuelyn/core';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface ReceiptScannerProps {
  /** Called when OCR + parse complete with a usable result.
   *  The parent decides whether to pre-fill a form, show a
   *  preview, or anything else. */
  readonly onResult: (parsed: ParsedReceipt, rawText: string) => void;
  /** Optional className passthrough for layout fitting. */
  readonly className?: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading-engine' }
  | { kind: 'recognizing'; progress: number }
  | { kind: 'parsing' }
  | { kind: 'error'; message: string };

export function ReceiptScanner({ onResult, className }: ReceiptScannerProps) {
  const { t } = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // Keep the worker around for the lifetime of the component so
  // subsequent scans skip the 4 MB language-data download.
  const workerRef = useRef<unknown | null>(null);

  // Tear down the worker on unmount — leaving it running would
  // hold onto the wasm memory after the user leaves the page.
  useEffect(() => {
    return () => {
      const w = workerRef.current as { terminate?: () => Promise<void> } | null;
      if (w && typeof w.terminate === 'function') {
        void w.terminate();
      }
      workerRef.current = null;
    };
  }, []);

  const ensureWorker = useCallback(async (): Promise<unknown> => {
    if (workerRef.current) return workerRef.current;

    setStatus({ kind: 'loading-engine' });
    // Lazy-load Tesseract so the 4 MB+ wasm only ships when
    // someone actually scans something.
    const tesseract = await import('tesseract.js');
    // German first, English fallback for chains that print in EN.
    const worker = await tesseract.createWorker(['deu', 'eng'], 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          setStatus({ kind: 'recognizing', progress: m.progress });
        }
      },
    });
    workerRef.current = worker;
    return worker;
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const worker = (await ensureWorker()) as {
          recognize: (img: File | Blob) => Promise<{ data: { text: string } }>;
        };

        setStatus({ kind: 'recognizing', progress: 0 });
        const { data } = await worker.recognize(file);

        setStatus({ kind: 'parsing' });
        const parsed = parseReceipt(data.text);

        // Reset status so subsequent scans show the picker
        // instead of a stale "parsing…" label.
        setStatus({ kind: 'idle' });
        onResult(parsed, data.text);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ReceiptScanner] OCR failed:', err);
        setStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : t('receiptScanner.errorGeneric'),
        });
      }
    },
    [ensureWorker, onResult, t],
  );

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void handleFile(file);
    // Reset the input so picking the same file twice still
    // triggers onChange (browsers cache the value otherwise).
    e.target.value = '';
  };

  const isBusy =
    status.kind === 'loading-engine' ||
    status.kind === 'recognizing' ||
    status.kind === 'parsing';

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onChange}
        className="sr-only"
        aria-label={t('receiptScanner.pickAria')}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isBusy}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl
                   bg-[var(--color-brand-50)] dark:bg-[var(--color-brand-900)]/30
                   text-[var(--color-brand-700)] dark:text-[var(--color-brand-300)]
                   border border-[var(--color-brand-200)] dark:border-[var(--color-brand-800)]/60
                   px-4 py-2.5 text-sm font-semibold
                   hover:bg-[var(--color-brand-100)] dark:hover:bg-[var(--color-brand-900)]/50
                   disabled:opacity-60 disabled:cursor-not-allowed
                   transition-colors"
      >
        <CameraIcon />
        {isBusy ? t('receiptScanner.busyCta') : t('receiptScanner.cta')}
      </button>

      {/* Status line — only rendered when something is happening */}
      {status.kind !== 'idle' && (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-xs text-[var(--color-fg-subtle)] text-center"
        >
          {status.kind === 'loading-engine' && t('receiptScanner.statusLoadingEngine')}
          {status.kind === 'recognizing' && (
            <>
              {t('receiptScanner.statusRecognizing')} {Math.round(status.progress * 100)}%
            </>
          )}
          {status.kind === 'parsing' && t('receiptScanner.statusParsing')}
          {status.kind === 'error' && (
            <span className="text-[var(--color-danger-500)]">
              {t('receiptScanner.errorPrefix')}: {status.message}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
    </svg>
  );
}
