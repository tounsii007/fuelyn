// ============================================================
// NotificationBell — Header icon button with dropdown
// Shows a bell icon with an active-dot indicator. Clicking opens
// a dropdown panel containing the PriceAlertSettings.
// ============================================================

'use client';

import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { PriceAlertSettings } from './PriceAlertSettings';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const priceAlertEnabled = useAppStore((s) => s.priceAlertEnabled);
  const notificationPermission = useAppStore((s) => s.notificationPermission);

  const isActive = priceAlertEnabled && notificationPermission === 'granted';

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Preisalarm-Einstellungen"
        aria-expanded={open}
      >
        <svg
          className="w-[18px] h-[18px] text-gray-500 dark:text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>

        {/* Active indicator dot */}
        {isActive && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-500 ring-2 ring-white dark:ring-surface-dark-secondary" />
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-surface-dark-secondary
                     rounded-2xl shadow-sheet border border-gray-100 dark:border-gray-700
                     p-4 z-50 animate-slide-down"
        >
          <PriceAlertSettings />
        </div>
      )}
    </div>
  );
}
