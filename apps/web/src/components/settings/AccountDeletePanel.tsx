// ============================================================
// AccountDeletePanel — GDPR Art. 17 right-to-erasure UI
// (Iter AH).
//
// Two-step confirmation: first tap exposes the destructive
// button; second tap (with type-to-confirm) actually fires the
// DELETE /api/account call. On success, every locally-cached
// piece of data (localStorage + sessionStorage) is wiped and the
// page reloads — the next request will create a fresh anonymous
// user.
// ============================================================

'use client';

import { useState } from 'react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useToast } from '@/components/ui/Toast';

const CONFIRM_PHRASE = 'LÖSCHEN';

export function AccountDeletePanel() {
  const { t } = useTranslations();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);

  const wipeLocal = () => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      /* private-mode browsers throw */
    }
  };

  const onDelete = async () => {
    if (phrase !== CONFIRM_PHRASE) return;
    setBusy(true);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'X-Fuelyn-Csrf': '1',
          'X-Fuelyn-Device': window.localStorage.getItem('fuelyn:deviceId') ?? '',
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.show({
          tone: 'danger',
          title: t('accountDelete.errorTitle'),
          description: body?.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      wipeLocal();
      toast.show({
        tone: 'success',
        title: t('accountDelete.successTitle'),
        description: t('accountDelete.successDesc'),
      });
      // Hard-refresh so a fresh anonymous session is created.
      setTimeout(() => { window.location.replace('/'); }, 800);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label={t('accountDelete.title')}
      className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-3 space-y-2 border border-red-200 dark:border-red-800/40"
    >
      <div>
        <p className="text-sm font-medium text-red-900 dark:text-red-200">
          {t('accountDelete.title')}
        </p>
        <p className="text-xs text-red-700 dark:text-red-300/80">
          {t('accountDelete.desc')}
        </p>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-red-700 dark:text-red-300 underline-offset-2 hover:underline"
        >
          {t('accountDelete.openCta')}
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs text-red-700 dark:text-red-300">
              {t('accountDelete.confirmLabel').replace('{phrase}', CONFIRM_PHRASE)}
            </span>
            <input
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-red-300 dark:border-red-700
                         bg-white dark:bg-gray-900 text-red-900 dark:text-red-100
                         focus:outline-none focus:ring-2 focus:ring-red-500"
              autoComplete="off"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setOpen(false); setPhrase(''); }}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-medium
                         text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {t('accountDelete.cancel')}
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy || phrase !== CONFIRM_PHRASE}
              className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 px-3 py-2 text-xs font-medium text-white
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? t('accountDelete.deleting') : t('accountDelete.confirmCta')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
