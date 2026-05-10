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

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import { evaluateBorderHints, type BorderCountry } from '@fuelyn/core';

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

  const result = useMemo(() => {
    if (!userLocation) return null;
    return evaluateBorderHints({
      origin: { lat: userLocation.lat, lng: userLocation.lng },
      fuelType,
      vehicleTankL: vehicle?.tankCapacity ?? undefined,
    });
  }, [userLocation, fuelType, vehicle]);

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

      <p className="mt-3 text-[10px] text-[var(--color-fg-subtle)]">
        {t('borderCrossing.disclaimer')}
      </p>
    </section>
  );
}
