// ============================================================
// BorderCrossingCard — "tank im Ausland" hint
//
// Surfaces a small advisory card when the user is close enough to
// a foreign border that crossing for the next refuel makes sense.
// Renders nothing if:
//   * no user location is known
//   * no neighbour passes the worthwhile threshold
// so the card stays out of the way for users who can't benefit.
//
// Numbers are estimates from the static EU-bulletin reference
// table — the UI labels them as "geschätzte Ersparnis" so users
// don't expect live foreign-station prices.
// ============================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import { evaluateBorderHints, isFeatureUnlocked, type BorderCountry } from '@fuelyn/core';

const COUNTRY_FLAG: Record<BorderCountry, string> = {
  LU: '🇱🇺',
  FR: '🇫🇷',
  CH: '🇨🇭',
  AT: '🇦🇹',
  CZ: '🇨🇿',
  PL: '🇵🇱',
  NL: '🇳🇱',
  BE: '🇧🇪',
  DK: '🇩🇰',
};

export function BorderCrossingCard() {
  const hydrated = useIsHydrated();
  const { t } = useTranslations();
  const userLocation = useAppStore((s) => s.userLocation);
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const vehicle = useAppStore((s) => s.vehicle);
  const subscription = useAppStore((s) => s.subscription);
  const canUseLive = isFeatureUnlocked('border-crossing-live', subscription);
  const [livePrice, setLivePrice] = useState<number | null>(null);

  const result = useMemo(() => {
    if (!userLocation) return null;
    return evaluateBorderHints({
      origin: { lat: userLocation.lat, lng: userLocation.lng },
      fuelType,
      vehicleTankL: vehicle?.tankCapacity ?? undefined,
    });
  }, [userLocation, fuelType, vehicle]);

  // Premium-gated: free users see the static estimate. Premium users
  // see the live foreign-station price for AT/FR (more countries to
  // come as their open-data adapters land).
  useEffect(() => {
    if (!canUseLive || !result?.best) return;
    if (!['AT', 'FR'].includes(result.best.country)) return;
    let cancelled = false;
    const controller = new AbortController();
    const url = new URL('/api/border-crossing', window.location.origin);
    url.searchParams.set('country', result.best.country);
    // Use the foreign waypoint coords (already in BORDER_WAYPOINTS).
    // We can re-derive lat/lng from the result's distance vector;
    // simplest is to pass the user's location and rely on the BFF
    // to find the nearest foreign station.
    if (userLocation) {
      url.searchParams.set('lat', String(userLocation.lat));
      url.searchParams.set('lng', String(userLocation.lng));
    }
    url.searchParams.set('fuel', fuelType);
    fetch(url.toString(), { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setLivePrice(j.cheapestPrice ?? null); })
      .catch(() => { /* fall through to static estimate */ });
    return () => { cancelled = true; controller.abort(); };
  }, [canUseLive, fuelType, result, userLocation]);

  if (!hydrated || !result || !result.best) return null;

  const { best } = result;
  const ctPerL = Math.round(Math.abs(best.estimatedSavingsEurPerL) * 100);
  const flag = COUNTRY_FLAG[best.country];
  const perFillEur = best.estimatedSavingsPerFillEur;

  return (
    <section
      aria-labelledby="border-card-title"
      className="rounded-2xl border border-[var(--color-border-subtle)]
                 bg-gradient-to-br from-[var(--color-info-50)] to-[var(--color-bg)]
                 dark:from-[var(--color-info-900)]/30 dark:to-[var(--color-bg)]
                 p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl leading-none" aria-hidden="true">
          {flag}
        </span>
        <div className="min-w-0 flex-1">
          <p
            id="border-card-title"
            className="text-[11px] uppercase tracking-wide text-[var(--color-fg-subtle)]"
          >
            {t('borderCrossing.eyebrow')}
          </p>
          <h3 className="text-sm font-semibold text-[var(--color-fg)] truncate">
            {best.cityDe} · {best.distanceKm.toFixed(0)} km
          </h3>
        </div>
      </div>

      <p className="text-sm text-[var(--color-fg)] mb-3">
        {t('borderCrossing.hint')
          .replace('{ctPerL}', String(ctPerL))
          .replace('{fuel}', fuelType.toUpperCase())}
      </p>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] text-[var(--color-fg-subtle)]">
            {t('borderCrossing.savingPerL')}
          </p>
          <p className="text-xl font-bold tabular-nums text-[var(--color-success-600)] dark:text-[var(--color-success-400)]">
            −{ctPerL} ct/L
          </p>
        </div>
        {perFillEur != null && perFillEur > 0 && (
          <div className="text-right">
            <p className="text-[11px] text-[var(--color-fg-subtle)]">
              {t('borderCrossing.savingPerFill')}
            </p>
            <p className="text-xl font-bold tabular-nums text-[var(--color-success-600)] dark:text-[var(--color-success-400)]">
              ≈ −{perFillEur.toFixed(2)} €
            </p>
          </div>
        )}
      </div>

      {/* Live-price banner (Premium only). Falls back silently to
          the static estimate when the foreign adapter is empty. */}
      {canUseLive && livePrice != null && (
        <p className="mt-3 rounded-lg bg-[var(--color-success-50)] dark:bg-[var(--color-success-900)]/30
                       text-[11px] text-[var(--color-success-700)] dark:text-[var(--color-success-300)]
                       px-2 py-1.5 inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success-500)] animate-pulse" />
          {t('borderCrossing.liveBadge')}: {livePrice.toFixed(3).replace('.', ',')} €/L
        </p>
      )}

      <p className="mt-3 text-[10px] text-[var(--color-fg-subtle)]">
        {canUseLive && livePrice != null
          ? t('borderCrossing.liveDisclaimer')
          : t('borderCrossing.disclaimer')}
      </p>
    </section>
  );
}
