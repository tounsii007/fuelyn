// ============================================================
// SettingsPage — Extended settings with i18n, map style,
// fuel type, search radius, notifications, data, and about.
// ============================================================

'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { FUEL_TYPE_LABELS } from '@fuelyn/core';
import type { ThemeMode, FuelType, MapStyle, BackgroundVariant, AppLocale } from '@fuelyn/core';
import { CountryFlag, type FlagCode } from '@/components/ui/CountryFlag';
import { SpritmonitorImport } from '@/components/settings/SpritmonitorImport';
import { MembershipPicker } from '@/components/settings/MembershipPicker';

// ─── Background variants ────────────────────────────────────
//
// Six pre-designed gradient meshes. Their CSS lives in
// `apps/web/src/styles/tokens.css` under `[data-bg="…"] .fy-mesh`.
// Applied globally via ThemeSync, which writes `data-bg` on <html>.
const BG_OPTIONS: ReadonlyArray<{
  value: BackgroundVariant;
  label: string;
  preview: string;
}> = [
  { value: 'aurora',  label: 'Aurora',  preview: 'linear-gradient(135deg, oklch(0.62 0.20 245), oklch(0.66 0.20 145), oklch(0.66 0.16 230))' },
  { value: 'sunset',  label: 'Sunset',  preview: 'linear-gradient(135deg, oklch(0.78 0.18 30), oklch(0.66 0.22 10), oklch(0.78 0.13 340))' },
  { value: 'ocean',   label: 'Ocean',   preview: 'linear-gradient(135deg, oklch(0.68 0.16 200), oklch(0.62 0.18 220), oklch(0.58 0.14 180))' },
  { value: 'forest',  label: 'Forest',  preview: 'linear-gradient(135deg, oklch(0.72 0.14 150), oklch(0.66 0.16 130), oklch(0.58 0.10 100))' },
  { value: 'cyber',   label: 'Cyber',   preview: 'linear-gradient(135deg, oklch(0.66 0.22 320), oklch(0.66 0.22 280), oklch(0.72 0.18 350))' },
  { value: 'minimal', label: 'Minimal', preview: 'linear-gradient(135deg, oklch(0.94 0.02 240), oklch(0.86 0.03 240))' },
];

const APP_VERSION = '0.1.0';

// ─── Map Style Options ──────────────────────────────────────

const MAP_STYLE_OPTIONS: { value: MapStyle; labelKey: string; icon: string }[] = [
  { value: 'standard', labelKey: 'settings.mapStandard', icon: 'M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z' },
  { value: 'satellite', labelKey: 'settings.mapSatellite', icon: 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418' },
  { value: 'terrain', labelKey: 'settings.mapTerrain', icon: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V4.5a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v15a1.5 1.5 0 001.5 1.5z' },
  { value: 'dark', labelKey: 'settings.mapDark', icon: 'M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z' },
];

// ─── Fuel Type Options ──────────────────────────────────────

const FUEL_TYPE_OPTIONS: { value: FuelType; color: string }[] = [
  { value: 'e5', color: 'bg-fuel-e5' },
  { value: 'e10', color: 'bg-fuel-e10' },
  { value: 'diesel', color: 'bg-fuel-diesel' },
];

export function SettingsPage() {
  const { t } = useTranslations();
  const settings = useAppStore((s) => s.settings);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLocale = useAppStore((s) => s.setLocale);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const clearSearchHistory = useAppStore((s) => s.clearSearchHistory);
  const clearPriceHistory = useAppStore((s) => s.clearPriceHistory);

  const [cacheCleared, setCacheCleared] = useState(false);
  const [radiusValue, setRadiusValue] = useState(settings.defaultRadiusKm);

  const handleClearCache = useCallback(() => {
    clearSearchHistory();
    clearPriceHistory();

    // Clear caches via service worker
    if ('caches' in window) {
      void caches.keys().then((names) => {
        for (const name of names) {
          void caches.delete(name);
        }
      });
    }

    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 3000);
  }, [clearSearchHistory, clearPriceHistory]);

  const handleRadiusChange = useCallback(
    (value: number) => {
      setRadiusValue(value);
      updateSettings({ defaultRadiusKm: value });
    },
    [updateSettings],
  );

  return (
    <div className="max-w-2xl mx-auto p-6 pb-20 animate-fade-in">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400
                   hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {t('common.back')}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        {t('settings.title')}
      </h1>

      {/*
        Sticky quick-jump nav sits between the title and the first
        section. On mobile it stays at the top while the user
        scrolls so they can warp to any settings section in one
        tap, which beats the previous "scroll-and-look" pattern
        on a 9-section page.
      */}
      <SettingsJumpNav />

      <div className="space-y-6">
        {/* ── Section: Language ─────────────────────────── */}
        <SettingsSection
          id="sec-language"
          title={t('settings.language')}
          currentValue={
            settings.locale === 'de'
              ? 'Deutsch'
              : settings.locale === 'fr'
                ? 'Français'
                : settings.locale === 'en-US'
                  ? 'English (US)'
                  : 'English'
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { code: 'de',    flag: 'DE', labelKey: 'settings.languageDe'   },
                { code: 'en',    flag: 'GB', labelKey: 'settings.languageEn'   },
                { code: 'en-US', flag: 'US', labelKey: 'settings.languageEnUs' },
                { code: 'fr',    flag: 'FR', labelKey: 'settings.languageFr'   },
              ] as ReadonlyArray<{ code: AppLocale; flag: FlagCode; labelKey: string }>
            ).map(({ code, flag, labelKey }) => (
              <LanguageButton
                key={code}
                label={t(labelKey)}
                flag={flag}
                active={settings.locale === code}
                onClick={() => setLocale(code)}
              />
            ))}
          </div>
        </SettingsSection>

        {/* ── Section: Appearance ───────────────────────── */}
        <SettingsSection
          id="sec-theme"
          title={t('settings.theme')}
          currentValue={
            settings.theme === 'light' ? t('settingsExtra.themeLightShort')
              : settings.theme === 'dark' ? t('settingsExtra.themeDarkShort')
              : t('settingsExtra.themeSystemShort')
          }
        >
          <div className="grid grid-cols-3 gap-2">
            {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setTheme(mode)}
                className={`flex flex-col items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all
                  ${settings.theme === mode
                    ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
                  }`}
              >
                <ThemeIcon mode={mode} />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {mode === 'light' ? t('settings.themeLight')
                    : mode === 'dark' ? t('settings.themeDark')
                    : t('settings.themeSystem')}
                </span>
              </button>
            ))}
          </div>

          {/* Background variant picker — applies live via data-bg on <html> */}
          <div className="mt-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              {t('settingsExtra.background')}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {BG_OPTIONS.map((opt) => {
                const active = (settings.background ?? 'aurora') === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateSettings({ background: opt.value })}
                    className={`group relative flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-all
                      ${active
                        ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20'
                        : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
                      }`}
                    aria-pressed={active}
                  >
                    <span
                      aria-hidden="true"
                      className="w-full h-12 rounded-lg shadow-inner ring-1 ring-black/5"
                      style={{ backgroundImage: opt.preview }}
                    />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {opt.label}
                    </span>
                    {active && (
                      <svg
                        className="absolute top-1 right-1 w-4 h-4 text-brand-600 bg-white dark:bg-surface-dark-secondary rounded-full p-0.5 shadow-sm"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </SettingsSection>

        {/* ── Section: Map Style ───────────────────────── */}
        <SettingsSection
          id="sec-map"
          title={t('settings.mapStyle')}
          currentValue={
            settings.mapStyle === 'standard'   ? t('settings.mapStandard')
              : settings.mapStyle === 'dark'      ? t('settings.mapDark')
              : settings.mapStyle === 'satellite' ? t('settings.mapSatellite')
              : t('settings.mapTerrain')
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {MAP_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateSettings({ mapStyle: opt.value })}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left
                  ${settings.mapStyle === opt.value
                    ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
                  }`}
              >
                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
                </svg>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t(opt.labelKey)}
                </span>
                {settings.mapStyle === opt.value && (
                  <svg className="w-4 h-4 text-brand-600 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </SettingsSection>

        {/* ── Section: Fuel Type ────────────────────────── */}
        <SettingsSection
          id="sec-fuel"
          title={t('settings.defaultFuelType')}
          currentValue={FUEL_TYPE_LABELS[settings.defaultFuelType]}
        >
          <div className="flex gap-2">
            {FUEL_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateSettings({ defaultFuelType: opt.value })}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all
                  ${settings.defaultFuelType === opt.value
                    ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
                  }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${opt.color}`} />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {FUEL_TYPE_LABELS[opt.value]}
                </span>
              </button>
            ))}
          </div>
        </SettingsSection>

        {/* ── Section: Brand-Loyalty Cards ─────────────── */}
        <MembershipPicker />

        {/* ── Section: Search Radius ───────────────────── */}
        <SettingsSection
          id="sec-radius"
          title={t('settings.searchRadius')}
          currentValue={`${radiusValue} km`}
        >
          <div className="px-1">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl font-bold text-brand-600">
                {radiusValue}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('settings.searchRadiusUnit')}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={radiusValue}
              onChange={(e) => handleRadiusChange(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer
                         bg-gray-200 dark:bg-gray-700
                         accent-brand-600"
              aria-label={t('settings.searchRadius')}
            />
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-gray-400">1 km</span>
              <span className="text-xs text-gray-400">25 km</span>
              <span className="text-xs text-gray-400">50 km</span>
            </div>
          </div>
        </SettingsSection>

        {/* ── Section: Privacy & Location ──────────────── */}
        <PrivacySection />

        {/* ── Section: Notifications ───────────────────── */}
        <SettingsSection id="sec-notifications" title={t('settings.notifications')}>
          <Link
            href="/alerts"
            className="flex items-center justify-between p-4 -m-4 rounded-xl
                       hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-xl
                              flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('settings.priceAlert')}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {t('settings.notificationsDesc')}
                </p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        </SettingsSection>

        {/* ── Section: Data ─────────────────────────────── */}
        <SettingsSection id="sec-data" title={t('settings.data')}>
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleClearCache}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl
                         bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800
                         transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.clearCache')}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {t('settings.clearCacheDesc')}
                  </p>
                </div>
              </div>
              {cacheCleared && (
                <span className="text-xs font-medium text-green-600 dark:text-green-400 animate-fade-in">
                  {t('settings.cacheCleared')}
                </span>
              )}
            </button>

            {/* Export / import section — sits inside the Data card
                because it's the same conceptual surface (managing
                what's stored locally). Exports the user's whole
                client-side state as a portable JSON blob; imports
                merges it back. The full action lives in
                ImportExportRow so the existing render stays scannable. */}
            <ImportExportRow />

            {/* Spritmonitor.de CSV import — separate row because
                it's a one-way bridge from a third-party tool, not
                a Fuelyn-native backup format. Same Data card so
                everything that touches stored history is in one
                place. */}
            <SpritmonitorImport />

            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {t('settings.lastUpdate')}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatLastUpdate()}
              </span>
            </div>
          </div>
        </SettingsSection>

        {/* ── Section: About ───────────────────────────── */}
        <SettingsSection id="sec-about" title={t('settings.about')}>
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('settings.version')}
              </span>
              <span className="text-sm font-mono font-medium text-gray-700 dark:text-gray-300">
                v{APP_VERSION}
              </span>
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
              {t('settings.appDescription')}
            </p>

            <div className="flex flex-col gap-1 pt-2">
              <AboutLink href="/privacy" label={t('settings.privacy')} />
              <AboutLink href="/imprint" label={t('settings.imprint')} />
              <AboutLink
                href="https://github.com/fuelyn"
                label={t('settings.github')}
                external
              />
            </div>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

// ─── Import / Export row ────────────────────────────────────
//
// Lets the user move their client-side state — favourites,
// vehicle profile, fuel-log, saved locations, search history,
// preferences — between devices or back-up to disk. Round-trips
// as a single JSON document so the file is easy to inspect.
//
// Export: opens a download dialog with a timestamped filename.
// Import: file-picker → JSON.parse → shallow-merge into the store
//         under a single setState call, so listeners only re-render
//         once. Unknown fields are ignored (forward-compatible).
//         Validation is intentionally light because this is a
//         self-restore path, not a public API surface.
function ImportExportRow() {
  const { t } = useTranslations();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'err'; message: string }>({
    kind: 'idle',
    message: '',
  });

  const exportData = useCallback(() => {
    try {
      const s = useAppStore.getState();
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: s.settings,
        vehicle: s.vehicle,
        favorites: s.favorites,
        priceAlerts: s.priceAlerts,
        fuelLog: s.fuelLog,
        savedLocations: s.savedLocations,
        searchHistory: s.searchHistory,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `fuelyn-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus({ kind: 'ok', message: t('settingsExtra.exportStarted') });
      setTimeout(() => setStatus({ kind: 'idle', message: '' }), 3000);
    } catch (e) {
      setStatus({ kind: 'err', message: t('settingsExtra.exportFailed') });
    }
  }, [t]);

  const importData = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Defensive: only accept fields we recognise. Unknown keys
      // are ignored so a future export with extra columns doesn't
      // pollute today's store.
      useAppStore.setState((cur) => ({
        settings: { ...cur.settings, ...(data.settings ?? {}) },
        vehicle: data.vehicle ?? cur.vehicle,
        favorites: Array.isArray(data.favorites) ? data.favorites : cur.favorites,
        priceAlerts: Array.isArray(data.priceAlerts) ? data.priceAlerts : cur.priceAlerts,
        fuelLog: Array.isArray(data.fuelLog) ? data.fuelLog : cur.fuelLog,
        savedLocations: Array.isArray(data.savedLocations) ? data.savedLocations : cur.savedLocations,
        searchHistory: Array.isArray(data.searchHistory) ? data.searchHistory : cur.searchHistory,
      }));
      setStatus({ kind: 'ok', message: t('settingsExtra.importSuccess') });
      setTimeout(() => setStatus({ kind: 'idle', message: '' }), 3000);
    } catch {
      setStatus({ kind: 'err', message: t('settingsExtra.importReadFailed') });
      setTimeout(() => setStatus({ kind: 'idle', message: '' }), 4000);
    }
  }, [t]);

  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-3 space-y-2">
      <div className="flex items-center gap-3 mb-1">
        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12M12 16.5V3" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Daten exportieren / importieren
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Favoriten, Fahrzeug, Logbuch &amp; Einstellungen als JSON
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportData}
          className="flex-1 min-w-[120px] rounded-lg bg-white dark:bg-gray-900 px-3 py-2 text-xs font-semibold
                     text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800
                     border border-gray-200 dark:border-gray-700 transition-colors"
        >
          Export (JSON)
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 min-w-[120px] rounded-lg bg-white dark:bg-gray-900 px-3 py-2 text-xs font-semibold
                     text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800
                     border border-gray-200 dark:border-gray-700 transition-colors"
        >
          Import (JSON)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importData(f);
            // Reset so re-selecting the same file still triggers change
            e.target.value = '';
          }}
        />
      </div>
      {status.kind !== 'idle' && (
        <p
          className={`text-[11px] mt-1 ${
            status.kind === 'ok'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          }`}
          role="status"
        >
          {status.message}
        </p>
      )}
    </div>
  );
}

// ─── Privacy & Location section ─────────────────────────────
//
// Exposes user-facing controls for the parts of the app that touch
// the device's GPS:
//   • Live-Tracking toggle — drives `settings.liveLocationEnabled`
//   • Permission-status badge — read-only, reflects what the
//     browser tells us (granted / prompt / denied) so the user
//     knows whether the toggle will actually work.
//   • Accuracy hint — last reported ±NN m, surfaces the precision
//     of the most recent fix so users can tell if a coarse Wi-Fi
//     guess is dragging their distance numbers.
//   • Standort vergessen — clears the stored coords so the next
//     load starts fresh (useful when switching devices/phones).
//
// Co-located with SettingsSection so the file stays one stop-shop
// for the whole page; pulling it into a separate file would scatter
// related UI across the codebase for no real benefit at this size.
function PrivacySection() {
  const { t } = useTranslations();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const permission = useAppStore((s) => s.locationPermission);
  const accuracy = useAppStore((s) => s.userLocationAccuracy);
  const liveTracking = useAppStore((s) => s.liveTracking);
  const setUserLocation = useAppStore((s) => s.setUserLocation);

  const liveOn = settings.liveLocationEnabled;

  const permissionTone =
    permission === 'granted'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
      : permission === 'denied'
        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  const permissionLabel =
    permission === 'granted'
      ? t('liveGps.permissionGranted')
      : permission === 'denied'
        ? t('liveGps.permissionDenied')
        : t('liveGps.permissionPrompt');

  return (
    <section
      id="sec-privacy"
      className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5 scroll-mt-24"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">
        {t('liveGps.sectionTitle')}
      </h2>

      {/* Live-tracking toggle row */}
      <div className="flex items-start justify-between gap-4 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {t('liveGps.toggleTitle')}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {t('liveGps.toggleDesc')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={liveOn}
          onClick={() => updateSettings({ liveLocationEnabled: !liveOn })}
          className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
            liveOn ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-700'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              liveOn ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Status row — read-only diagnostics about the GPS state */}
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 text-center">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {t('liveGps.permission')}
          </p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${permissionTone}`}>
            {permissionLabel}
          </span>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {t('liveGps.trackingLabel')}
          </p>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              liveTracking
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {liveTracking ? t('liveGps.trackingActive') : t('liveGps.trackingInactive')}
          </span>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {t('liveGps.accuracyLabel')}
          </p>
          <span className="mt-1 inline-block rounded-full bg-gray-200 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-semibold text-gray-700 dark:text-gray-300">
            {accuracy != null && Number.isFinite(accuracy) ? `±${Math.round(accuracy)} m` : '—'}
          </span>
        </div>
      </div>

      {/* Forget-location action */}
      <button
        type="button"
        onClick={() => setUserLocation(null)}
        className="mt-3 w-full rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-left text-sm
                   text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800
                   transition-colors"
      >
        <span className="font-medium">{t('settingsExtra.forgetLocation')}</span>
        <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {t('settingsExtra.forgetLocationDesc')}
        </span>
      </button>
    </section>
  );
}

function SettingsSection({
  /** Stable hash anchor for the quick-jump nav. Optional — when
   *  omitted the section is still rendered but won't be a jump
   *  target. The id is also used as the key in the jump-nav row. */
  id,
  title,
  /** Optional current value displayed next to the title — useful
   *  so the user sees their current selection without expanding
   *  every section ("Sprache · Deutsch", "Standard-Kraftstoff ·
   *  Super E10"). Long values truncate with ellipsis. */
  currentValue,
  children,
}: {
  id?: string;
  title: string;
  currentValue?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      // scroll-mt offsets the sticky anchor nav so a hash-jump
      // doesn't hide the heading under it. Matches the strip's
      // height + a comfortable margin.
      className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5 scroll-mt-24"
    >
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {title}
        </h2>
        {currentValue && (
          <span
            className="truncate text-xs font-medium text-gray-600 dark:text-gray-300"
            title={currentValue}
          >
            {currentValue}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Sticky horizontal anchor-jump row. Sits under the page title and
 * lets the user warp to any section without scrolling — particularly
 * useful on mobile where the page is one long ribbon.
 *
 * The list is hardcoded (rather than generated from an array of
 * `{id, label}` because we want the labels to be authored by hand
 * and stay synced with the section titles even as those evolve.
 */
function SettingsJumpNav() {
  const { t } = useTranslations();
  const items: { href: string; label: string }[] = [
    { href: '#sec-language',      label: t('settingsExtra.jumpLanguage') },
    { href: '#sec-theme',         label: t('settingsExtra.jumpTheme') },
    { href: '#sec-map',           label: t('settingsExtra.jumpMap') },
    { href: '#sec-fuel',          label: t('settingsExtra.jumpFuel') },
    { href: '#sec-radius',        label: t('settingsExtra.jumpRadius') },
    { href: '#sec-privacy',       label: t('settingsExtra.jumpPrivacy') },
    { href: '#sec-notifications', label: t('settingsExtra.jumpAlerts') },
    { href: '#sec-data',          label: t('settingsExtra.jumpData') },
    { href: '#sec-about',         label: t('settingsExtra.jumpAbout') },
  ];
  return (
    <nav
      aria-label={t('settingsExtra.jumpNavAria')}
      className="sticky top-0 -mx-6 px-6 py-2 mb-4 z-10
                 bg-[var(--color-bg)]/85 backdrop-blur-md
                 border-b border-[var(--color-border-subtle)]"
    >
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {items.map((it) => (
          <a
            key={it.href}
            href={it.href}
            className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium
                       text-gray-600 dark:text-gray-300
                       bg-gray-100 dark:bg-gray-800
                       hover:bg-brand-50 dark:hover:bg-brand-900/30
                       hover:text-brand-700 dark:hover:text-brand-300
                       transition-colors"
          >
            {it.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function LanguageButton({
  label,
  flag,
  active,
  onClick,
}: {
  label: string;
  flag: FlagCode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all
        ${active
          ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20'
          : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
        }`}
    >
      <CountryFlag code={flag} className="w-7 h-5 flex-shrink-0" title={label} />
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {active && (
        <svg className="w-4 h-4 text-brand-600 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
    </button>
  );
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === 'light') {
    return (
      <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>
    );
  }
  if (mode === 'dark') {
    return (
      <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
      </svg>
    );
  }
  return (
    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
  );
}

function AboutLink({
  href,
  label,
  external = false,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  const className = `flex items-center justify-between px-3 py-2.5 -mx-2 rounded-xl
                     hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group`;

  const content = (
    <>
      <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors">
        {label}
      </span>
      <svg className="w-4 h-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {external ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        )}
      </svg>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function formatLastUpdate(): string {
  try {
    const raw = localStorage.getItem('fuelyn:lastUpdate');
    if (!raw) return '-';
    const date = new Date(raw);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  } catch {
    return '-';
  }
}
