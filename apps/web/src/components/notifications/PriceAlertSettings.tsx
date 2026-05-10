// ============================================================
// PriceAlertSettings — Push notification preferences panel
// Lets users enable/disable price alerts, set per-fuel-type
// thresholds, and manage notification permission.
// ============================================================

'use client';

import { useCallback } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useNotifications } from '@/lib/hooks/use-notifications';
import { useTranslations } from '@/lib/hooks/use-translations';
import { FUEL_TYPE_LABELS } from '@fuelyn/core';
import type { FuelType } from '@fuelyn/core';

const FUEL_TYPES: FuelType[] = ['e5', 'e10', 'diesel'];

const FUEL_COLOR_MAP: Record<FuelType, string> = {
  diesel: 'bg-fuel-diesel',
  e5: 'bg-fuel-e5',
  e10: 'bg-fuel-e10',
};

const FUEL_RING_MAP: Record<FuelType, string> = {
  diesel: 'focus:ring-fuel-diesel',
  e5: 'focus:ring-fuel-e5',
  e10: 'focus:ring-fuel-e10',
};

export function PriceAlertSettings() {
  const { t } = useTranslations();
  const priceAlertEnabled = useAppStore((s) => s.priceAlertEnabled);
  const setPriceAlertEnabled = useAppStore((s) => s.setPriceAlertEnabled);
  const priceAlertThreshold = useAppStore((s) => s.priceAlertThreshold);
  const setPriceAlertThreshold = useAppStore((s) => s.setPriceAlertThreshold);
  const radiusKm = useAppStore((s) => s.filter.radiusKm);

  const {
    isSupported,
    permission,
    subscribe,
    unsubscribe,
    sendTestNotification,
  } = useNotifications();

  // ------------------------------------------------------------------
  // Toggle master switch — request permission on first enable
  // ------------------------------------------------------------------
  const handleToggle = useCallback(async () => {
    if (!priceAlertEnabled) {
      // Turning on: request notification permission
      await subscribe();
      setPriceAlertEnabled(true);
    } else {
      // Turning off: unsubscribe and disable
      await unsubscribe();
      setPriceAlertEnabled(false);
    }
  }, [priceAlertEnabled, subscribe, unsubscribe, setPriceAlertEnabled]);

  // ------------------------------------------------------------------
  // Per-fuel threshold change
  // ------------------------------------------------------------------
  const handleThresholdChange = useCallback(
    (ft: FuelType, raw: string) => {
      const parsed = parseFloat(raw);
      setPriceAlertThreshold(ft, Number.isFinite(parsed) && parsed > 0 ? parsed : null);
    },
    [setPriceAlertThreshold],
  );

  // ------------------------------------------------------------------
  // Permission status label
  // ------------------------------------------------------------------
  const permissionLabel = (() => {
    if (!isSupported) return t('priceAlertSettings.permUnsupported');
    if (permission === 'granted') return t('priceAlertSettings.permGranted');
    if (permission === 'denied') return t('priceAlertSettings.permDenied');
    return t('priceAlertSettings.permPrompt');
  })();

  const permissionColor = (() => {
    if (permission === 'granted') return 'text-reach-safe';
    if (permission === 'denied') return 'text-reach-unreachable';
    return 'text-gray-400 dark:text-gray-500';
  })();

  return (
    <div className="space-y-5">
      {/* ── Header with master toggle ────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {t('priceAlertSettings.sectionTitle')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {t('priceAlertSettings.sectionDesc')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={!isSupported}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
            priceAlertEnabled && permission === 'granted'
              ? 'bg-brand-600'
              : 'bg-gray-300 dark:bg-gray-600'
          } ${!isSupported ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          aria-label={priceAlertEnabled ? t('priceAlertSettings.disableAria') : t('priceAlertSettings.enableAria')}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              priceAlertEnabled && permission === 'granted'
                ? 'translate-x-5'
                : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* ── Permission status ────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/60 rounded-xl">
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            permission === 'granted'
              ? 'bg-reach-safe'
              : permission === 'denied'
                ? 'bg-reach-unreachable'
                : 'bg-gray-300 dark:bg-gray-600'
          }`}
        />
        <span className="text-xs text-gray-600 dark:text-gray-300">
          {t('priceAlertSettings.permLabel')}
        </span>
        <span className={`text-xs font-semibold ${permissionColor}`}>
          {permissionLabel}
        </span>
      </div>

      {permission === 'denied' && (
        <p className="text-xs text-reach-unreachable">
          {t('priceAlertSettings.permDeniedHint')}
        </p>
      )}

      {/* ── Fuel type thresholds ─────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
          {t('priceAlertSettings.targetPrices')}
        </p>
        {FUEL_TYPES.map((ft) => (
          <div
            key={ft}
            className="flex items-center gap-3 bg-white dark:bg-surface-dark-secondary rounded-xl
                       border border-gray-100 dark:border-gray-700 px-3 py-2.5"
          >
            <div className={`w-2.5 h-2.5 rounded-full ${FUEL_COLOR_MAP[ft]} flex-shrink-0`} />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1">
              {FUEL_TYPE_LABELS[ft]}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">&lt;</span>
              <input
                type="number"
                placeholder="—"
                step={0.01}
                min={0.5}
                max={3.0}
                value={priceAlertThreshold[ft] ?? ''}
                onChange={(e) => handleThresholdChange(ft, e.target.value)}
                disabled={!priceAlertEnabled || permission !== 'granted'}
                className={`w-20 px-2 py-1 text-sm text-right rounded-lg border border-gray-200
                           dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900
                           dark:text-gray-100 focus:outline-none focus:ring-2
                           ${FUEL_RING_MAP[ft]}
                           disabled:opacity-40 disabled:cursor-not-allowed`}
                aria-label={t('priceAlertSettings.targetPriceAria').replace('{fuel}', FUEL_TYPE_LABELS[ft])}
              />
              <span className="text-xs text-gray-400">€/L</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Monitoring radius (read-only, from global filter) ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/60 rounded-xl">
        <span className="text-xs text-gray-600 dark:text-gray-300">
          {t('priceAlertSettings.monitoringRadius')}
        </span>
        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
          {radiusKm} km
        </span>
      </div>

      {/* ── Test notification button ─────────────────────────── */}
      {priceAlertEnabled && permission === 'granted' && (
        <button
          type="button"
          onClick={sendTestNotification}
          className="w-full py-2 text-xs font-semibold text-brand-600 dark:text-brand-400
                     bg-brand-50 dark:bg-brand-950/30 rounded-xl
                     hover:bg-brand-100 dark:hover:bg-brand-950/50 transition-colors"
        >
          {t('priceAlertSettings.sendTestCta')}
        </button>
      )}
    </div>
  );
}
