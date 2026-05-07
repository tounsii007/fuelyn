// ============================================================
// Wrapped Slides — declarative pieces that compose into a story.
// All slides assume a dark, full-bleed parent and are bidi-safe.
// ============================================================

'use client';

import type { ReactNode } from 'react';
import type { WrappedReport } from '@tankpilot/core';
import { CountUp } from './CountUp';

const MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

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
    <div className="max-w-md w-full text-center text-white tp-enter">
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
  return (
    <SlideLayout>
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70 mb-3">
        TankPilot Wrapped
      </div>
      <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-none">
        Dein {report.year}
      </h1>
      <p className="mt-4 text-base text-white/80 leading-relaxed">
        Eine kurze Reise durch dein Tank-Jahr. Zum Weiterklicken einfach tippen.
      </p>
      <div className="mt-10 flex flex-col items-center gap-2 text-white/70 text-xs">
        <ChevronRight />
        <span>Tippen zum Starten</span>
      </div>
    </SlideLayout>
  );
}

// ─── Slide 2: Liter ───────────────────────────────────────

export function LitersSlide({ report }: SlideProps) {
  return (
    <SlideLayout eyebrow="So viel hast du getankt">
      <div className="font-extrabold text-white tabular-nums">
        <CountUp to={report.totals.liters} className="text-7xl md:text-8xl leading-none" />
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">Liter</div>
      <p className="mt-6 text-sm text-white/75">
        Verteilt auf{' '}
        <strong className="text-white">{report.totals.entries}</strong>{' '}
        Tankvorgänge bei{' '}
        <strong className="text-white">{report.totals.distinctBrands}</strong>{' '}
        Marken.
      </p>
    </SlideLayout>
  );
}

// ─── Slide 3: Geld ────────────────────────────────────────

export function MoneySlide({ report }: SlideProps) {
  return (
    <SlideLayout eyebrow="Insgesamt ausgegeben">
      <div className="font-extrabold text-white tabular-nums">
        <CountUp
          to={report.totals.eur}
          format={(v) =>
            new Intl.NumberFormat('de-DE', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            }).format(v)
          }
          className="text-7xl md:text-8xl leading-none"
        />
      </div>
      <p className="mt-6 text-sm text-white/75">
        Im Schnitt{' '}
        <strong className="text-white">
          {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
            report.averages.costPerVisit,
          )}
        </strong>{' '}
        pro Tankstopp — bei{' '}
        <strong className="text-white">
          {report.averages.pricePerLiter.toFixed(3).replace('.', ',')} €/L
        </strong>
        .
      </p>
    </SlideLayout>
  );
}

// ─── Slide 4: Distance ────────────────────────────────────

export function DistanceSlide({ report }: SlideProps) {
  if (report.distance.km <= 0) return null;
  return (
    <SlideLayout eyebrow="Damit bist du gefahren">
      <div className="font-extrabold text-white tabular-nums">
        <CountUp to={report.distance.km} className="text-6xl md:text-7xl leading-none" />
      </div>
      <div className="mt-2 text-xl font-semibold text-white">km</div>
      {report.distance.avgConsumptionLPer100Km != null && (
        <p className="mt-6 text-sm text-white/75">
          Verbrauch:{' '}
          <strong className="text-white">
            {report.distance.avgConsumptionLPer100Km.toString().replace('.', ',')} L/100&nbsp;km
          </strong>
        </p>
      )}
    </SlideLayout>
  );
}

// ─── Slide 5: CO₂ ─────────────────────────────────────────

export function Co2Slide({ report }: SlideProps) {
  const trees = Math.round(report.totals.co2Kg / 22); // 1 tree absorbs ~22 kg/year
  return (
    <SlideLayout eyebrow="Dein CO₂-Fußabdruck">
      <div className="font-extrabold text-white tabular-nums">
        <CountUp to={report.totals.co2Kg} className="text-6xl md:text-7xl leading-none" />
      </div>
      <div className="mt-2 text-xl font-semibold text-white">kg CO₂</div>
      {trees > 0 && (
        <p className="mt-6 text-sm text-white/75">
          Das entspricht der jährlichen Bindung von{' '}
          <strong className="text-white">{trees} Bäumen</strong>.
        </p>
      )}
    </SlideLayout>
  );
}

// ─── Slide 6: Top Brand ───────────────────────────────────

export function TopBrandSlide({ report }: SlideProps) {
  if (!report.topBrand) return null;
  const tb = report.topBrand;
  return (
    <SlideLayout eyebrow="Deine Stamm-Tanke">
      <div className="text-7xl md:text-8xl font-extrabold tracking-tight leading-none mb-4">
        {tb.brand}
      </div>
      <p className="text-sm text-white/75 mt-6">
        <strong className="text-white">{tb.visits}</strong> Besuche ·{' '}
        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
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
  const c = report.highlights.cheapest?.entry;
  if (!c) return null;
  const date = new Date(c.date).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
  });
  return (
    <SlideLayout eyebrow="Dein bester Deal">
      <div className="font-extrabold text-white tabular-nums">
        <span className="text-7xl md:text-8xl leading-none">
          {c.pricePerLiter.toFixed(3).replace('.', ',')}
        </span>
        <span className="text-3xl ml-2">€/L</span>
      </div>
      <p className="mt-6 text-sm text-white/75">
        am <strong className="text-white">{date}</strong> bei{' '}
        <strong className="text-white">{c.stationBrand}</strong>
      </p>
    </SlideLayout>
  );
}

// ─── Slide 8: Best Day of Week ────────────────────────────

export function BestDaySlide({ report }: SlideProps) {
  const best = report.dayOfWeekPattern[0];
  if (!best) return null;
  return (
    <SlideLayout eyebrow="Dein günstigster Wochentag">
      <div className="text-6xl md:text-7xl font-extrabold tracking-tight leading-none mb-4">
        {best.label}
      </div>
      <p className="text-sm text-white/75">
        Im Schnitt{' '}
        <strong className="text-white">
          {best.avgPricePerLiter.toFixed(3).replace('.', ',')} €/L
        </strong>{' '}
        an {best.visits} {best.visits === 1 ? 'Besuch' : 'Besuchen'}.
      </p>
    </SlideLayout>
  );
}

// ─── Slide 9: Savings vs market ───────────────────────────

export function SavingsSlide({ report }: SlideProps) {
  const s = report.savingsVsAverage;
  const userBeatMarket = s.diffEur < 0;
  return (
    <SlideLayout eyebrow={userBeatMarket ? 'Du hast den Markt geschlagen' : 'Was wäre wenn …'}>
      <div className="font-extrabold text-white tabular-nums">
        <span className="text-6xl md:text-7xl leading-none">
          {userBeatMarket ? '−' : '+'}
          {Math.abs(s.diffEur)
            .toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-2xl ml-2">€</span>
      </div>
      <p className="mt-6 text-sm text-white/75 leading-relaxed">
        {userBeatMarket ? (
          <>
            Du hast{' '}
            <strong className="text-white">
              {Math.abs(s.diffPercent).toFixed(1).replace('.', ',')}%
            </strong>{' '}
            unter dem Marktdurchschnitt getankt — gut gemacht!
          </>
        ) : (
          <>
            So viel mehr hast du gegenüber dem Marktschnitt gezahlt. Mit deinem
            Wochentag-Pattern sind nächstes Jahr ~{Math.abs(s.diffEur).toFixed(0)} € drin.
          </>
        )}
      </p>
    </SlideLayout>
  );
}

// ─── Slide 10: Most active month ──────────────────────────

export function FrequencySlide({ report }: SlideProps) {
  const m = report.streaks.mostFrequentMonth;
  if (!m) return null;
  return (
    <SlideLayout eyebrow="Dein aktivster Monat">
      <div className="text-6xl md:text-7xl font-extrabold tracking-tight leading-none">
        {MONTH_NAMES[m.month] ?? '—'}
      </div>
      <p className="mt-6 text-sm text-white/75">
        <strong className="text-white">{m.visits}</strong> Tankstopps in einem Monat — busy!
      </p>
    </SlideLayout>
  );
}

// ─── Slide 11: Outro ──────────────────────────────────────

export function OutroSlide({ report }: SlideProps) {
  return (
    <SlideLayout>
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70 mb-3">
        Bis nächstes Jahr
      </div>
      <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
        Danke, dass du{' '}
        <span
          className="text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/60"
        >
          smart tankst.
        </span>
      </h2>
      <p className="mt-6 text-sm text-white/80">
        Insgesamt {report.totals.entries} Tankstopps · {report.totals.distinctBrands} Marken ·{' '}
        {report.totals.distinctStations} Stationen
      </p>
      <p className="mt-10 text-xs text-white/60">
        Wir sehen uns für deinen #{report.year + 1} Wrapped!
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
