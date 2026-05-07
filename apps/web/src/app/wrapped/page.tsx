// ============================================================
// /wrapped — Year-in-Review story page.
//
// All compute happens client-side from the local zustand store
// (no backend round-trip). Renders an empty state when there
// isn't enough data; otherwise shows the StoryShell.
// ============================================================

'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppStore } from '@/lib/store/app-store';
import { computeWrapped, type WrappedReport } from '@fuelyn/core';
import { StoryShell, type StorySlide } from '@/components/wrapped/StoryShell';
import {
  CoverSlide,
  LitersSlide,
  MoneySlide,
  DistanceSlide,
  Co2Slide,
  TopBrandSlide,
  CheapestSlide,
  BestDaySlide,
  SavingsSlide,
  FrequencySlide,
  OutroSlide,
} from '@/components/wrapped/slides';
import { Button } from '@/components/ui/Button';

export default function WrappedPage() {
  return (
    <Suspense
      fallback={
        <main className="fixed inset-0 z-[80] fy-mesh fy-mesh-animated grid place-items-center">
          <div className="text-white/80 text-sm">Lade Wrapped …</div>
        </main>
      }
    >
      <WrappedPageInner />
    </Suspense>
  );
}

function WrappedPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const fuelLog = useAppStore((s) => s.fuelLog);
  const priceHistory = useAppStore((s) => s.priceHistory);

  const yearParam = params.get('year');
  const targetYear = yearParam ? Number(yearParam) : new Date().getFullYear();

  const report: WrappedReport = useMemo(
    () => computeWrapped({ entries: fuelLog, priceHistory, year: targetYear }),
    [fuelLog, priceHistory, targetYear],
  );

  if (!report.hasMinimumData) {
    return <NotEnoughData year={targetYear} />;
  }

  const slides: StorySlide[] = buildSlides(report);

  return (
    <StoryShell
      slides={slides}
      title={`Fuelyn Wrapped ${report.year}`}
      subtitle={`${report.totals.entries} Tankstopps · ${report.totals.liters.toFixed(0)} L`}
      onClose={() => router.push('/')}
    />
  );
}

function buildSlides(report: WrappedReport): StorySlide[] {
  const make = (id: string, node: React.ReactNode, durationMs?: number): StorySlide | null =>
    node ? { id, node, durationMs } : null;

  const all = [
    make('cover', <CoverSlide report={report} />, 4500),
    make('liters', <LitersSlide report={report} />),
    make('money', <MoneySlide report={report} />),
    report.distance.km > 0 ? make('distance', <DistanceSlide report={report} />) : null,
    make('co2', <Co2Slide report={report} />),
    report.topBrand ? make('top-brand', <TopBrandSlide report={report} />) : null,
    report.highlights.cheapest ? make('cheapest', <CheapestSlide report={report} />) : null,
    report.dayOfWeekPattern.length > 0
      ? make('best-day', <BestDaySlide report={report} />)
      : null,
    make('savings', <SavingsSlide report={report} />, 7000),
    report.streaks.mostFrequentMonth
      ? make('frequency', <FrequencySlide report={report} />)
      : null,
    make('outro', <OutroSlide report={report} />, 6000),
  ];

  return all.filter((s): s is StorySlide => s != null);
}

function NotEnoughData({ year }: { year: number }) {
  return (
    <main className="fixed inset-0 z-[80] fy-mesh fy-mesh-animated flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center text-white fy-enter">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70 mb-3">
          Fuelyn Wrapped {year}
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
          Noch nicht genug Daten.
        </h1>
        <p className="mt-4 text-sm text-white/80 leading-relaxed">
          Wir brauchen mindestens 3 Einträge in deinem Tank-Logbuch, bevor wir
          dir ein Jahr in Zahlen erzählen können. Trag deinen letzten Tank-Stopp
          ein — und tippe wieder hier rein.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/fuel-log">
            <Button size="lg">Tank-Logbuch öffnen</Button>
          </Link>
          <Link href="/">
            <Button size="lg" variant="ghost" className="text-white border-white/30 hover:bg-white/10">
              Zur Karte
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
