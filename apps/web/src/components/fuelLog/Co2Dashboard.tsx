// ============================================================
// Co2Dashboard — monthly CO₂ trend + lifetime stats card.
//
// Renders below the existing fuel-log stats. Reads the same
// fuelLog from Zustand and runs summarizeCo2() from core to
// produce:
//   - A 12-month bar chart (CSS only, no chart library) of
//     monthly CO₂ kg with stacked diesel/e5/e10 segments
//   - Three KPIs: lifetime CO₂, equivalent tree-years, last-30d
//   - Per-fuel ring with relative shares
//
// Bar chart implementation note: we avoid Recharts/Chart.js
// because they ship 80–200 kB of JS for a 12-bar overview the
// user looks at for 3 seconds. Pure flexbox + percentage
// heights gives an identical UX with zero new dependencies.
// ============================================================

'use client';

import { useMemo } from 'react';
import {
  summarizeCo2,
  type MonthlyCo2Bucket,
  type FuelType,
} from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';

const FUEL_COLORS: Record<FuelType, string> = {
  diesel: 'bg-amber-500 dark:bg-amber-400',
  e5: 'bg-rose-500 dark:bg-rose-400',
  e10: 'bg-emerald-500 dark:bg-emerald-400',
};

const FUEL_LABEL: Record<FuelType, string> = {
  diesel: 'Diesel',
  e5: 'E5',
  e10: 'E10',
};

export function Co2Dashboard({ className = '' }: { className?: string }) {
  const { t, locale } = useTranslations();
  const hydrated = useIsHydrated();
  const fuelLog = useAppStore((s) => s.fuelLog);

  const summary = useMemo(() => summarizeCo2(fuelLog), [fuelLog]);

  if (!hydrated) return null;
  if (summary.monthly.length === 0) return null;

  const last12 = summary.monthly.slice(0, 12).reverse(); // oldest left → newest right
  const maxBucket = Math.max(...last12.map((m) => m.co2Kg), 1);

  return (
    <section
      aria-label={t('co2Dashboard.title')}
      className={`bg-white dark:bg-gray-800/90 rounded-2xl shadow-card
                  border border-gray-100 dark:border-gray-700/60
                  p-5 ${className}`}
    >
      <header className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {t('co2Dashboard.title')}
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {t('co2Dashboard.subtitle')}
          </p>
        </div>
        {summary.rolling30dKg !== null && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                           text-[10px] font-semibold
                           bg-emerald-100 text-emerald-700
                           dark:bg-emerald-900/40 dark:text-emerald-300">
            {summary.rolling30dKg.toFixed(0)} {t('co2Dashboard.unitLast30d')}
          </span>
        )}
      </header>

      {/* KPI strip */}
      <dl className="grid grid-cols-3 gap-3 mb-5">
        <Kpi
          label={t('co2Dashboard.kpiLifetime')}
          value={`${summary.totalCo2Kg.toFixed(0)} kg`}
        />
        <Kpi
          label={t('co2Dashboard.kpiTreeYears')}
          value={String(summary.treeYearsEquivalent)}
        />
        <Kpi
          label={t('co2Dashboard.kpiLiters')}
          value={`${summary.totalLiters.toFixed(0)} L`}
        />
      </dl>

      {/* Monthly bar chart */}
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          {t('co2Dashboard.monthlyChart')}
        </h4>
        <div
          className="flex items-end justify-between gap-1 h-28"
          role="img"
          aria-label={t('co2Dashboard.monthlyChart')}
        >
          {last12.map((m) => (
            <MonthBar key={m.ymKey} bucket={m} max={maxBucket} locale={locale} />
          ))}
        </div>
      </div>

      {/* Per-fuel breakdown ring (rendered as a horizontal stacked bar) */}
      {summary.totalCo2Kg > 0 && (
        <div className="mt-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            {t('co2Dashboard.perFuelTitle')}
          </h4>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
            {(['diesel', 'e5', 'e10'] as FuelType[]).map((ft) => {
              const share = summary.byFuel[ft].share;
              if (share <= 0) return null;
              return (
                <div
                  key={ft}
                  className={FUEL_COLORS[ft]}
                  style={{ width: `${share * 100}%` }}
                  title={`${FUEL_LABEL[ft]}: ${(share * 100).toFixed(0)}% (${summary.byFuel[ft].co2Kg.toFixed(0)} kg)`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[10px]">
            {(['diesel', 'e5', 'e10'] as FuelType[]).map((ft) => {
              const share = summary.byFuel[ft].share;
              if (share <= 0) return null;
              return (
                <span key={ft} className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                  <span className={`w-2 h-2 rounded-full ${FUEL_COLORS[ft]}`} aria-hidden="true" />
                  {FUEL_LABEL[ft]} · {(share * 100).toFixed(0)}%
                </span>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </dt>
      <dd className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums mt-0.5">
        {value}
      </dd>
    </div>
  );
}

function MonthBar({
  bucket,
  max,
  locale,
}: {
  bucket: MonthlyCo2Bucket;
  max: number;
  locale: string;
}) {
  const total = bucket.co2Kg;
  const heightPct = (total / max) * 100;
  const date = new Date(bucket.year, bucket.month, 1);
  // Use Intl for short month label so it follows the active locale
  const monthLabel = (() => {
    try {
      return new Intl.DateTimeFormat(locale, { month: 'short' }).format(date);
    } catch {
      return new Intl.DateTimeFormat('en', { month: 'short' }).format(date);
    }
  })();

  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
      <div
        className="relative w-full max-w-[18px] h-full flex flex-col justify-end rounded-sm overflow-hidden bg-gray-100 dark:bg-gray-700"
        title={`${monthLabel} ${bucket.year}: ${total.toFixed(1)} kg CO₂`}
      >
        {(['diesel', 'e5', 'e10'] as FuelType[]).map((ft) => {
          const share = total > 0 ? bucket.byFuel[ft].co2Kg / total : 0;
          if (share <= 0) return null;
          return (
            <div
              key={ft}
              className={FUEL_COLORS[ft]}
              style={{ height: `${share * heightPct}%` }}
            />
          );
        })}
      </div>
      <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400 truncate">
        {monthLabel}
      </span>
    </div>
  );
}
