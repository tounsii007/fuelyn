// ============================================================
// PumpPhotoCapture — pump-display photo → OCR → parsed price.
//
// Sister of ReceiptScanner, but tuned for the simpler structure
// of a pump display: just price + fuel grade. Used inside the
// PriceReportForm to provide visual proof for crowd-sourced
// price corrections.
//
// Tesseract is loaded lazily (~4 MB wasm), so users who never
// tap the camera button never pay the bundle cost.
// ============================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { parsePumpDisplay, type ParsedPumpDisplay } from '@fuelyn/core';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface PumpPhotoCaptureProps {
  /** Called once OCR + parse finished. Result may have null fields. */
  readonly onResult: (parsed: ParsedPumpDisplay, rawText: string) => void;
  readonly className?: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading-engine' }
  | { kind: 'recognizing'; progress: number }
  | { kind: 'parsing' }
  | { kind: 'error'; message: string };

export function PumpPhotoCapture({ onResult, className }: PumpPhotoCaptureProps) {
  const { t } = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const workerRef = useRef<unknown | null>(null);

  useEffect(() => {
    return () => {
      const w = workerRef.current as { terminate?: () => Promise<void> } | null;
      if (w?.terminate) void w.terminate();
      workerRef.current = null;
    };
  }, []);

  const ensureWorker = useCallback(async (): Promise<unknown> => {
    if (workerRef.current) return workerRef.current;
    setStatus({ kind: 'loading-engine' });
    const tesseract = await import('tesseract.js');
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
        const parsed = parsePumpDisplay(data.text);
        setStatus({ kind: 'idle' });
        onResult(parsed, data.text);
      } catch (err) {
        console.error('[PumpPhotoCapture] OCR failed:', err);
        setStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : t('pumpPhoto.errorGeneric'),
        });
      }
    },
    [ensureWorker, onResult, t],
  );

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void handleFile(file);
    e.target.value = '';
  };

  const isBusy =
    status.kind === 'loading-engine' ||
    status.kind === 'recognizing' ||
    status.kind === 'parsing';

  const statusLabel =
    status.kind === 'loading-engine'
      ? t('pumpPhoto.statusLoadingEngine')
      : status.kind === 'recognizing'
        ? `${t('pumpPhoto.statusRecognizing')} ${Math.round(status.progress * 100)}%`
        : status.kind === 'parsing'
          ? t('pumpPhoto.statusParsing')
          : status.kind === 'error'
            ? `${t('pumpPhoto.errorPrefix')}: ${status.message}`
            : '';

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onChange}
        className="sr-only"
        aria-label={t('pumpPhoto.pickAria')}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isBusy}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)]
                   bg-[var(--color-bg)] px-3 py-1.5 text-xs font-medium text-[var(--color-fg)]
                   hover:bg-[var(--color-surface-hover)] disabled:opacity-50 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {isBusy ? t('pumpPhoto.busyCta') : t('pumpPhoto.cta')}
      </button>
      {statusLabel && (
        <p className="mt-2 text-[11px] text-[var(--color-fg-subtle)]">{statusLabel}</p>
      )}
    </div>
  );
}
