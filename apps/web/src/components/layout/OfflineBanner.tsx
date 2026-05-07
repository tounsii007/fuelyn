// ============================================================
// OfflineBanner — Slim banner that appears when the user is
// offline, with smooth animate in/out and auto-dismiss on
// reconnection.
// ============================================================

'use client';

import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { useTranslations } from '@/lib/hooks/use-translations';

type BannerState = 'hidden' | 'offline' | 'back-online';

export function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus();
  const { t } = useTranslations();
  const [state, setState] = useState<BannerState>('hidden');

  useEffect(() => {
    if (!isOnline) {
      setState('offline');
    } else if (wasOffline) {
      setState('back-online');
    } else {
      // Small delay before hiding to allow the exit animation to play
      const timer = setTimeout(() => setState('hidden'), 300);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (state === 'hidden') return null;

  const isOffline = state === 'offline';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        fixed top-0 left-0 right-0 z-[2500]
        flex items-center justify-center gap-2
        px-4 py-2
        text-xs font-medium text-white
        transition-all duration-300 ease-out
        ${isOffline
          ? 'bg-gray-700 dark:bg-gray-800 translate-y-0 opacity-100'
          : 'bg-green-600 dark:bg-green-700 translate-y-0 opacity-100'
        }
      `}
      style={{
        animation: isOffline
          ? 'slideDown 0.3s ease-out'
          : !wasOffline
            ? 'slideUp 0.3s ease-out forwards'
            : undefined,
      }}
    >
      {isOffline ? (
        <>
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>{t('offline.banner')}</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{t('offline.backOnline')}</span>
        </>
      )}
    </div>
  );
}
