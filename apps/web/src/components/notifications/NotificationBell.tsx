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
  // Count of price-alarm rules that are currently armed (enabled
  // === true). Drives the numeric pill on the bell so the user
  // can tell at a glance how many alarms they have running.
  // Subscribes to the alerts array directly so the badge updates
  // when rules are toggled in /alerts.
  const armedAlertCount = useAppStore((s) =>
    s.priceAlerts.reduce((acc, a) => acc + (a.enabled ? 1 : 0), 0),
  );

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

        {/*
          Two-tier indicator on the bell:
            - When ≥1 alarm is armed → numeric pill (most useful
              signal: "how many things am I tracking?"). Capped at
              "9+" so the pill stays one digit wide.
            - Else when push-notifications enabled → small dot
              (existing behaviour, "alerts surface enabled but
              you have no rules yet").
          The pill wins over the dot because the count is more
          informative and visually subsumes the "active" hint.
        */}
        {armedAlertCount > 0 ? (
          <span
            aria-label={`${armedAlertCount} aktive Preisalarme`}
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full
                       bg-brand-600 text-white text-[9px] font-semibold leading-4 text-center
                       ring-2 ring-white dark:ring-surface-dark-secondary"
          >
            {armedAlertCount > 9 ? '9+' : armedAlertCount}
          </span>
        ) : (
          isActive && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-500 ring-2 ring-white dark:ring-surface-dark-secondary" />
          )
        )}
      </button>

      {/* Dropdown Panel — z-[1100] sits above Leaflet's map controls
           (z-[1000]). Without this the bell-popup renders BEHIND
           the zoom/locate/refresh column on the right edge of the
           map and you can read its content through the buttons. */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-surface-dark-secondary
                     rounded-2xl shadow-sheet border border-gray-100 dark:border-gray-700
                     p-4 z-[1100] animate-slide-down"
        >
          <PriceAlertSettings />
        </div>
      )}
    </div>
  );
}
