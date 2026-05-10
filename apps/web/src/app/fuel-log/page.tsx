// ============================================================
// Fuel Log Page — Tank-Logbuch
// ============================================================

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { FUEL_TYPE_LABELS } from '@fuelyn/core';
import type { FuelType, ParsedReceipt } from '@fuelyn/core';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConsumptionTracker } from '@/components/intelligence/ConsumptionTracker';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { ReceiptScanner } from '@/components/fuelLog/ReceiptScanner';
import { Co2Dashboard } from '@/components/fuelLog/Co2Dashboard';
import { CarbonOffsetCard } from '@/components/co2/CarbonOffsetCard';
import { useToast } from '@/components/ui/Toast';
import { useTranslations } from '@/lib/hooks/use-translations';
import { IconButton } from '@/components/ui/IconButton';
import { StatCard } from '@/components/ui/StatCard';

export default function FuelLogPage() {
  const { t } = useTranslations();
  const toast = useToast();
  const fuelLog = useAppStore((s) => s.fuelLog);
  const setFuelLog = useAppStore((s) => s.setFuelLog);
  const addFuelLogEntry = useAppStore((s) => s.addFuelLogEntry);
  const removeFuelLogEntry = useAppStore((s) => s.removeFuelLogEntry);

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({
    stationName: '',
    stationBrand: '',
    fuelType: 'e10' as FuelType,
    liters: 30,
    pricePerLiter: 1.65,
    odometer: 0,
    note: '',
  });

  /**
   * OCR pre-fill handler — receives a ParsedReceipt from the
   * ReceiptScanner and merges it into the new-entry form.
   * Only overrides fields the user hasn't typed yet (anything
   * still at its default), otherwise the user could lose work
   * by accidentally tapping the scan button mid-form-fill.
   */
  const handleScanResult = useCallback(
    (parsed: ParsedReceipt) => {
      setIsAdding(true);
      setForm((prev) => ({
        stationName: prev.stationName || parsed.stationBrand || '',
        stationBrand: prev.stationBrand || parsed.stationBrand || '',
        fuelType: parsed.fuelType ?? prev.fuelType,
        liters: parsed.liters ?? prev.liters,
        pricePerLiter: parsed.pricePerLiter ?? prev.pricePerLiter,
        odometer: prev.odometer,
        note: prev.note,
      }));
      // Toast the user with the result so they know something
      // happened — and what fraction of fields landed.
      const filled = Math.round(parsed.confidence * 100);
      toast.show({
        tone: parsed.confidence >= 0.5 ? 'success' : 'warning',
        title: t('receiptScanner.toastTitle'),
        description: t('receiptScanner.toastDesc').replace(
          '{percent}',
          String(filled),
        ),
      });
    },
    [toast, t],
  );
  const totalPreview = Number.isFinite(form.liters * form.pricePerLiter)
    ? form.liters * form.pricePerLiter
    : 0;

  const handleAdd = useCallback(() => {
    if (
      !form.stationName.trim() ||
      !Number.isFinite(form.liters) ||
      !Number.isFinite(form.pricePerLiter) ||
      form.liters <= 0 ||
      form.pricePerLiter <= 0
    )
      return;
    addFuelLogEntry({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      stationName: form.stationName.trim(),
      stationBrand: form.stationBrand.trim(),
      fuelType: form.fuelType,
      liters: form.liters,
      pricePerLiter: form.pricePerLiter,
      totalCost: Math.round(form.liters * form.pricePerLiter * 100) / 100,
      odometer: form.odometer || undefined,
      note: form.note || undefined,
    });
    setIsAdding(false);
    setForm({
      stationName: '',
      stationBrand: '',
      fuelType: 'e10',
      liters: 30,
      pricePerLiter: 1.65,
      odometer: 0,
      note: '',
    });
  }, [form, addFuelLogEntry]);

  // Stats
  const stats = useMemo(() => {
    if (fuelLog.length === 0) return null;
    const totalCost = fuelLog.reduce((s, e) => s + e.totalCost, 0);
    const totalLiters = fuelLog.reduce((s, e) => s + e.liters, 0);
    const avgPrice = totalCost / totalLiters;
    return { totalCost, totalLiters, avgPrice, count: fuelLog.length };
  }, [fuelLog]);

  /**
   * Per-month aggregates for the new monthly-overview card.
   * Walks the log once, grouping by year-month key (YYYY-MM)
   * which keeps natural chronological ordering when sorted as
   * strings. Only the most recent 6 months are kept — past
   * that the card would crowd more than it informs.
   */
  const monthlyStats = useMemo(() => {
    if (fuelLog.length === 0) return [];
    const buckets = new Map<
      string,
      { ymKey: string; year: number; month: number; cost: number; liters: number; entries: number }
    >();
    for (const e of fuelLog) {
      const d = new Date(e.date);
      if (Number.isNaN(d.getTime())) continue;
      const ymKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cur = buckets.get(ymKey) ?? {
        ymKey,
        year: d.getFullYear(),
        month: d.getMonth(),
        cost: 0,
        liters: 0,
        entries: 0,
      };
      cur.cost += e.totalCost;
      cur.liters += e.liters;
      cur.entries += 1;
      buckets.set(ymKey, cur);
    }
    return [...buckets.values()]
      .sort((a, b) => b.ymKey.localeCompare(a.ymKey))
      .slice(0, 6);
  }, [fuelLog]);

  // Cheapest month → drives the green highlight on the monthly
  // overview card so a budget-watcher can spot their best month
  // at a glance.
  const cheapestMonthlyAvg = useMemo(() => {
    if (monthlyStats.length === 0) return null;
    return monthlyStats.reduce(
      (min, m) => {
        const avg = m.liters > 0 ? m.cost / m.liters : Infinity;
        return avg < min ? avg : min;
      },
      Infinity,
    );
  }, [monthlyStats]);

  const currentYmKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade-in">
      <PageHeader
        title="Tank-Logbuch"
        action={
          !isAdding && (
            <Button onClick={() => setIsAdding(true)} size="sm" leadingIcon={<PlusIcon />}>
              Eintrag
            </Button>
          )
        }
      />

      {/* KI Verbrauchstracker */}
      <ConsumptionTracker className="mb-4" />

      {/* CO₂ tracking dashboard — auto-suppresses when the log
          is empty so it never crowds the empty state. */}
      <Co2Dashboard className="mb-4" />

      {/* Carbon-offset marketplace (Iter U) — sits next to the CO₂
          dashboard so the user can act on what they just saw. */}
      <div className="mb-4">
        <CarbonOffsetCard />
      </div>

      {/* Stats Summary — lifetime totals */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard label="Gesamt" value={stats.totalCost.toFixed(2)} unit="€" />
          <StatCard label="Liter" value={stats.totalLiters.toFixed(1)} unit="L" />
          <StatCard
            label="Ø Preis"
            value={stats.avgPrice.toFixed(3)}
            unit="€"
            tone="brand"
          />
        </div>
      )}

      {/*
        Monthly overview card — six most recent months with cost,
        liters and Ø/L per row. Current month carries a brand-tinted
        chip so the user knows where they are; the month with the
        lowest average gets a green highlight so a budget-watcher
        can spot their best stretch at a glance.
      */}
      {monthlyStats.length > 0 && (
        <section
          aria-labelledby="monthly-heading"
          className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5 mb-4"
        >
          <div className="flex items-baseline justify-between mb-3">
            <h2
              id="monthly-heading"
              className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"
            >
              Monatsübersicht
            </h2>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              letzte {monthlyStats.length} {monthlyStats.length === 1 ? 'Monat' : 'Monate'}
            </span>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {monthlyStats.map((m) => {
              const monthName = new Date(m.year, m.month, 1).toLocaleDateString('de-DE', {
                month: 'long',
                year: 'numeric',
              });
              const avg = m.liters > 0 ? m.cost / m.liters : 0;
              const isCurrent = m.ymKey === currentYmKey;
              const isCheapest =
                cheapestMonthlyAvg != null &&
                m.liters > 0 &&
                avg <= cheapestMonthlyAvg + 0.0005 &&
                monthlyStats.length >= 2;
              return (
                <li key={m.ymKey} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {monthName}
                      {isCurrent && (
                        <span className="ml-2 inline-block rounded-full bg-brand-50 dark:bg-brand-900/30
                                         px-1.5 py-0.5 text-[9px] font-semibold tracking-wide
                                         text-brand-700 dark:text-brand-300 uppercase">
                          aktuell
                        </span>
                      )}
                      {isCheapest && (
                        <span className="ml-2 inline-block rounded-full bg-emerald-50 dark:bg-emerald-900/30
                                         px-1.5 py-0.5 text-[9px] font-semibold tracking-wide
                                         text-emerald-700 dark:text-emerald-300 uppercase">
                          ★ günstigster
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums">
                      {m.entries} {m.entries === 1 ? 'Eintrag' : 'Einträge'} ·{' '}
                      {m.liters.toFixed(1)} L ·{' '}
                      Ø {avg.toFixed(3)} €/L
                    </p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums whitespace-nowrap">
                    {m.cost.toFixed(2)} €
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Add Form */}
      {isAdding && (
        <section
          aria-labelledby="new-entry-heading"
          className="bg-white dark:bg-gray-800/90 rounded-2xl shadow-card
                     border border-gray-100 dark:border-gray-700/60
                     p-5 mb-4 animate-slide-down"
        >
          <h3
            id="new-entry-heading"
            className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4"
          >
            Neue Tankfüllung
          </h3>
          {/*
            Receipt scanner — lazy-loads Tesseract.js the first
            time the user taps it, parses the OCR'd text via the
            core parseReceipt() function, and pre-fills the form
            below. Same place the user would otherwise type from
            scratch — no separate flow, no surprise reroute.
          */}
          <div className="mb-4">
            <ReceiptScanner onResult={handleScanResult} />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <Input
                label="Tankstelle"
                type="text"
                value={form.stationName}
                onChange={(e) => setForm({ ...form, stationName: e.target.value })}
                placeholder="z. B. Aral Hauptstraße"
              />
            </div>
            <Select
              label="Kraftstoff"
              value={form.fuelType}
              onChange={(e) => setForm({ ...form, fuelType: e.target.value as FuelType })}
            >
              {Object.entries(FUEL_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Input
              label="Liter"
              type="number"
              value={form.liters}
              onChange={(e) =>
                setForm({ ...form, liters: Math.max(0, Number(e.target.value) || 0) })
              }
              step={0.1}
            />
            <Input
              label="Preis (€/L)"
              type="number"
              value={form.pricePerLiter}
              onChange={(e) =>
                setForm({ ...form, pricePerLiter: Math.max(0, Number(e.target.value) || 0) })
              }
              step={0.001}
            />
            <Input
              label="Kilometerstand"
              type="number"
              value={form.odometer || ''}
              onChange={(e) =>
                setForm({ ...form, odometer: Math.max(0, Number(e.target.value) || 0) })
              }
              placeholder="Optional"
            />
          </div>
          {/* Total preview */}
          <div className="bg-brand-50 dark:bg-brand-900/30 rounded-xl p-3 mb-4 text-center">
            <span className="text-xs font-medium text-brand-700/80 dark:text-brand-300/80">
              Gesamtkosten:
            </span>{' '}
            <span className="text-lg font-bold text-brand-700 dark:text-brand-200">
              {totalPreview.toFixed(2)} €
            </span>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} fullWidth>
              Speichern
            </Button>
            <Button variant="secondary" onClick={() => setIsAdding(false)}>
              Abbrechen
            </Button>
          </div>
        </section>
      )}

      {/* Log Entries */}
      {fuelLog.length === 0 ? (
        <EmptyState
          title="Noch keine Einträge"
          message="Protokolliere deine Tankfüllungen, um Kosten und Verbrauch zu tracken — oder probier die App mit Beispieldaten aus."
          action={{
            label: 'Mit Beispieldaten ausprobieren',
            onClick: () => {
              // Generate ~14 deterministic demo fills so the dashboard
              // (CO₂, smart-buying, heatmap, achievements, …) lights up
              // immediately. The first row carries a "demo" note so
              // users can find + delete it in one tap.
              import('@fuelyn/core').then(({ generateDemoFuelLog }) => {
                const demo = generateDemoFuelLog({});
                setFuelLog(demo);
              });
            },
          }}
        />
      ) : (
        <ul className="space-y-3">
          {fuelLog.map((entry) => (
            <li
              key={entry.id}
              className="bg-white dark:bg-gray-800/90 rounded-2xl shadow-card
                         border border-gray-100 dark:border-gray-700/60
                         p-4 transition-shadow hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {entry.stationName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(entry.date).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                    {' · '}
                    {FUEL_TYPE_LABELS[entry.fuelType]}
                  </p>
                </div>
                <IconButton
                  size="sm"
                  onClick={() => removeFuelLogEntry(entry.id)}
                  aria-label="Eintrag löschen"
                >
                  <svg
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </IconButton>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600 dark:text-gray-300 tabular-nums">
                  {entry.liters.toFixed(1)} L
                </span>
                <span className="text-gray-600 dark:text-gray-300 tabular-nums">
                  {entry.pricePerLiter.toFixed(3)} €/L
                </span>
                <span className="ml-auto font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {entry.totalCost.toFixed(2)} €
                </span>
              </div>
              {entry.odometer && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  km-Stand: {entry.odometer.toLocaleString('de-DE')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}
