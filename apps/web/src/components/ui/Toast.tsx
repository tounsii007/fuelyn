// ============================================================
// Toast — accessible notification stack with auto-dismiss.
//
// Usage:
//   const toast = useToast();
//   toast.show({ tone: 'success', title: 'Tank-Log gespeichert' });
//
// Mount once at the root by wrapping children in <ToastProvider>.
// ============================================================

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslations } from '@/lib/hooks/use-translations';

type Tone = 'success' | 'info' | 'warning' | 'danger';

export interface ToastInput {
  id?: string;
  tone?: Tone;
  title: string;
  description?: string;
  durationMs?: number;
}

interface Toast extends Required<Omit<ToastInput, 'description'>> {
  description?: string;
}

interface ToastApi {
  show: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_CLASS: Record<Tone, string> = {
  success: 'border-l-[var(--color-success-500)]',
  info: 'border-l-[var(--color-info-500)]',
  warning: 'border-l-[var(--color-warning-500)]',
  danger: 'border-l-[var(--color-danger-500)]',
};

const TONE_ICON: Record<Tone, string> = {
  success: '✓',
  info: 'ℹ',
  warning: '!',
  danger: '×',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  // Aliased to `tt` because `t` is already used as the .map() iterator
  // variable below for individual toasts — collision otherwise.
  const { t: tt } = useTranslations();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (input: ToastInput): string => {
      const id =
        input.id ??
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : String(Date.now() + Math.random()));
      const toast: Toast = {
        id,
        tone: input.tone ?? 'info',
        title: input.title,
        description: input.description,
        durationMs: input.durationMs ?? 4500,
      };
      setToasts((prev) => [...prev, toast]);
      const timer = setTimeout(() => dismiss(id), toast.durationMs);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  // Cleanup on unmount
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const value = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={[
              'pointer-events-auto bg-[var(--color-surface)] text-[var(--color-fg)]',
              'border border-[var(--color-border)] border-l-4',
              'rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] px-4 py-3',
              'flex items-start gap-3 animate-[tp-toast-in_var(--duration-default)_var(--ease-spring)]',
              TONE_CLASS[t.tone],
            ].join(' ')}
          >
            <span className="text-lg leading-none mt-0.5" aria-hidden="true">
              {TONE_ICON[t.tone]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{t.title}</div>
              {t.description && (
                <div className="text-xs text-[var(--color-fg-subtle)] mt-0.5">
                  {t.description}
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label={tt('miscAria.notificationClose')}
              onClick={() => dismiss(t.id)}
              className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] -mt-1 -mr-1 px-1 leading-none text-lg"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes tp-toast-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
