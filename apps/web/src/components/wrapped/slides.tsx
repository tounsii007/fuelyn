// ============================================================
// Wrapped Slides — declarative pieces that compose into a story.
// All slides assume a dark, full-bleed parent and are bidi-safe.
// ============================================================

'use client';

import type { ReactNode } from 'react';
import type { WrappedReport } from '@fuelyn/core';
import { CountUp } from './CountUp';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Locale-aware month name from a 0-indexed month number. Uses
 * Intl.DateTimeFormat so we get "Januar" / "January" / "janvier"
 * for free without bloating the i18n dictionary.
 */
function monthName(month: number, locale: string): string {
  const date = new Date(2025, month, 1);
  try {
    return new Intl.DateTimeFormat(locale, { month: 'long' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', { month: 'long' }).format(date);
  }
}

/** Tiny templating helper — replaces {key} placeholders. */
function tpl(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
    template,
  );
}

interface SlideProps {
  report: WrappedReport;
}

// Common layout container
function SlideLayout({
  eyebrow,
  children,
}: {
  eyebrow?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="max-w-md w-full text-center text-white fy-enter">
      {eyebrow && (
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70 mb-3">
          {eyebrow}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Slide 1: Cover ───────────────────────────────────────

export function CoverSlide({ report }: SlideProps) {
  const { t } = useTranslations();
  return (
    <SlideLayout>
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70 mb-3">
        {t('wrapped.coverEyebrow')}
      </div>
      <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-none">
        {tpl(t('wrapped.coverHeadline'), { year: report.year })}
      </h1>
      <p className="mt-4 text-base text-white/80 leading-relaxed">
        {t('wrapped.coverBody')}
      </p>
      <div className="mt-10 flex flex-col items-center gap-2 text-white/70 text-xs">
        <ChevronRight />
        <span>{t('wrapped.coverHint')}</span>
      </div>
    </SlideLayout>
  );
}

// ─── Slide 2: Liter ───────────────────────────────────────

export function LitersSlide({ report }: SlideProps) {
  const { t } = useTranslations();
  return (
    <SlideLayout eyebrow={t('wrapped.litersEyebrow')}>
      <div className="font-extrabold text-white tabular-nums">
        <CountUp to={report.totals.liters} className="text-7xl md:text-8xl leading-none" />
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{t('wrapped.litersUnit')}</div>
      <p className="mt-6 text-sm text-white/75">
        {tpl(t('wrapped.litersBody'), {
          entries: report.totals.entries,
          brands: report.totals.distinctBrands,
        })}
      </p>
    </SlideLayout>
  );
}

// ─── Slide 3: Geld ────────────────────────────────────────

export function MoneySlide({ report }: SlideProps) {
  const { t, locale } = useTranslations();
  const moneyFmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(v);
  const moneyFmtShort = (v: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(v);
  return (
    <SlideLayout eyebrow={t('wrapped.moneyEyebrow')}>
      <div className="font-extrabold text-white tabular-nums">
        <CountUp
          to={report.totals.eur}
          format={moneyFmtShort}
          className="text-7xl md:text-8xl leading-none"
        />
      </div>
      <p className="mt-6 text-sm text-white/75">
        {tpl(t('wrapped.moneyBody'), {
          avg: moneyFmt(report.averages.costPerVisit),
          price: report.averages.pricePerLiter.toFixed(3).replace('.', ','),
        })}
      </p>
    </SlideLayout>
  );
}

// ─── Slide 4: Distance ────────────────────────────────────

export function DistanceSlide({ report }: SlideProps) {
  const { t } = useTranslations();
  if (report.distance.km <= 0) return null;
  return (
    <SlideLayout eyebrow={t('wrapped.distanceEyebrow')}>
      <div className="font-extrabold text-white tabular-nums">
        <CountUp to={report.distance.km} className="text-6xl md:text-7xl leading-none" />
      </div>
      <div className="mt-2 text-xl font-semibold text-white">{t('wrapped.distanceUnit')}</div>
      {report.distance.avgConsumptionLPer100Km != null && (
        <p className="mt-6 text-sm text-white/75">
          {tpl(t('wrapped.distanceConsumption'), {
            consumption: report.distance.avgConsumptionLPer100Km.toString().replace('.', ','),
          })}
        </p>
      )}
    </SlideLayout>
  );
}

// ─── Slide 5: CO₂ ─────────────────────────────────────────

export function Co2Slide({ report }: SlideProps) {
  const { t } = useTranslations();
  const trees = Math.round(report.totals.co2Kg / 22); // 1 tree absorbs ~22 kg/year
  return (
    <SlideLayout eyebrow={t('wrapped.co2Eyebrow')}>
      <div className="font-extrabold text-white tabular-nums">
        <CountUp to={report.totals.co2Kg} className="text-6xl md:text-7xl leading-none" />
      </div>
      <div className="mt-2 text-xl font-semibold text-white">{t('wrapped.co2Unit')}</div>
      {trees > 0 && (
        <p className="mt-6 text-sm text-white/75">
          {tpl(t('wrapped.co2Trees'), { trees })}
        </p>
      )}
    </SlideLayout>
  );
}

// ─── Slide 6: Top Brand ───────────────────────────────────

export function TopBrandSlide({ report }: SlideProps) {
  const { t, locale } = useTranslations();
  if (!report.topBrand) return null;
  const tb = report.topBrand;
  return (
    <SlideLayout eyebrow={t('wrapped.topBrandEyebrow')}>
      <div className="text-7xl md:text-8xl font-extrabold tracking-tight leading-none mb-4">
        {tb.brand}
      </div>
      <p className="text-sm text-white/75 mt-6">
        <strong className="text-white">{tb.visits}</strong> {t('wrapped.topBrandBodyVisits')} ·{' '}
        {new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
          tb.totalEur,
        )}{' '}
        ·{' '}
        {tb.totalLiters.toFixed(0)} L
      </p>
    </SlideLayout>
  );
}

// ─── Slide 7: Cheapest Tank ───────────────────────────────

export function CheapestSlide({ report }: SlideProps) {
  const { t, locale } = useTranslations();
  const c = report.highlights.cheapest?.entry;
  if (!c) return null;
  const date = new Date(c.date).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
  });
  return (
    <SlideLayout eyebrow={t('wrapped.cheapestEyebrow')}>
      <div className="font-extrabold text-white tabular-nums">
        <span className="text-7xl md:text-8xl leading-none">
          {c.pricePerLiter.toFixed(3).replace('.', ',')}
        </span>
        <span className="text-3xl ml-2">€/L</span>
      </div>
      <p className="mt-6 text-sm text-white/75">
        {tpl(t('wrapped.cheapestBody'), { date, brand: c.stationBrand })}
      </p>
    </SlideLayout>
  );
}

// ─── Slide 8: Best Day of Week ────────────────────────────

export function BestDaySlide({ report }: SlideProps) {
  const { t } = useTranslations();
  const best = report.dayOfWeekPattern[0];
  if (!best) return null;
  return (
    <SlideLayout eyebrow={t('wrapped.bestDayEyebrow')}>
      <div className="text-6xl md:text-7xl font-extrabold tracking-tight leading-none mb-4">
        {best.label}
      </div>
      <p className="text-sm text-white/75">
        {tpl(t('wrapped.bestDayBody'), {
          price: `${best.avgPricePerLiter.toFixed(3).replace('.', ',')} €/L`,
          visits: best.visits,
          visitsLabel: best.visits === 1
            ? t('wrapped.bestDayVisitSingular')
            : t('wrapped.bestDayVisitPlural'),
        })}
      </p>
    </SlideLayout>
  );
}

// ─── Slide 9: Savings vs market ───────────────────────────

export function SavingsSlide({ report }: SlideProps) {
  const { t, locale } = useTranslations();
  const s = report.savingsVsAverage;
  const userBeatMarket = s.diffEur < 0;
  return (
    <SlideLayout
      eyebrow={
        userBeatMarket
          ? t('wrapped.savingsEyebrowBeat')
          : t('wrapped.savingsEyebrowBehind')
      }
    >
      <div className="font-extrabold text-white tabular-nums">
        <span className="text-6xl md:text-7xl leading-none">
          {userBeatMarket ? '−' : '+'}
          {Math.abs(s.diffEur)
            .toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-2xl ml-2">€</span>
      </div>
      <p className="mt-6 text-sm text-white/75 leading-relaxed">
        {userBeatMarket
          ? tpl(t('wrapped.savingsBeatBody'), {
              percent: Math.abs(s.diffPercent).toFixed(1).replace('.', ','),
            })
          : tpl(t('wrapped.savingsBehindBody'), {
              euro: Math.abs(s.diffEur).toFixed(0),
            })}
      </p>
    </SlideLayout>
  );
}

// ─── Slide 10: Most active month ──────────────────────────

export function FrequencySlide({ report }: SlideProps) {
  const { t, locale } = useTranslations();
  const m = report.streaks.mostFrequentMonth;
  if (!m) return null;
  return (
    <SlideLayout eyebrow={t('wrapped.frequencyEyebrow')}>
      <div className="text-6xl md:text-7xl font-extrabold tracking-tight leading-none">
        {monthName(m.month, locale)}
      </div>
      <p className="mt-6 text-sm text-white/75">
        {tpl(t('wrapped.frequencyBody'), { visits: m.visits })}
      </p>
    </SlideLayout>
  );
}

// ─── Slide 11: Outro ──────────────────────────────────────

export function OutroSlide({ report }: SlideProps) {
  const { t } = useTranslations();
  return (
    <SlideLayout>
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70 mb-3">
        {t('wrapped.outroEyebrow')}
      </div>
      <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
        <span
          className="text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/60"
        >
          {t('wrapped.outroHeadline')}
        </span>
      </h2>
      <p className="mt-6 text-sm text-white/80">
        {tpl(t('wrapped.outroSummary'), {
          entries: report.totals.entries,
          brands: report.totals.distinctBrands,
          stations: report.totals.distinctStations,
        })}
      </p>
      <p className="mt-10 text-xs text-white/60">
        {tpl(t('wrapped.outroNextYear'), { year: report.year + 1 })}
      </p>
    </SlideLayout>
  );
}

// ─── Decorations ──────────────────────────────────────────

function ChevronRight() {
  return (
    <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
    </svg>
  );
}
