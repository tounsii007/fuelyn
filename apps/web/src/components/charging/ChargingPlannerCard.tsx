// ============================================================
// ChargingPlannerCard — interactive EV-charging session planner.
//
// Lets the user dial in current SoC, target SoC, charger power
// and tariff and instantly see:
//   • energy required (kWh)
//   • session duration (min)
//   • total cost (€)
//   • effective cost per 100 km (€)
//
// The card auto-fills sensible defaults from the active vehicle's
// battery capacity + consumption when those are present.
// Re-renders eagerly on every input change because the engine is
// pure / synchronous / fast.
// ============================================================

'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import { planChargingSession } from '@fuelyn/core';

const PRESETS_KW: ReadonlyArray<{ label: string; kw: number }> = [
  { label: '11 kW · AC',   kw: 11 },
  { label: '22 kW · AC',   kw: 22 },
  { label: '50 kW · DC',   kw: 50 },
  { label: '150 kW · DC',  kw: 150 },
  { label: '300 kW · DC',  kw: 300 },
];

export function ChargingPlannerCard() {
  const hydrated = useIsHydrated();
  const { t } = useTranslations();
  const vehicle = useAppStore((s) => s.vehicle);

  // Pull defaults from the active vehicle when available, otherwise
  // fall back to "average mid-2026 EV" numbers.
  const defaults = useMemo(() => ({
    battery: vehicle?.batteryCapacity && vehicle.batteryCapacity > 0
      ? vehicle.batteryCapacity
      : 75,
    consumption: vehicle?.consumption && vehicle.consumption > 0
      ? vehicle.consumption
      : 18,
  }), [vehicle]);

  const [batteryKwh, setBatteryKwh] = useState<number>(defaults.battery);
  const [fromPct, setFromPct] = useState<number>(20);
  const [toPct, setToPct] = useState<number>(80);
  const [chargerKw, setChargerKw] = useState<number>(150);
  const [tariff, setTariff] = useState<number>(0.55);

  const result = useMemo(
    () =>
      planChargingSession({
        batteryKwh,
        fromPct,
        toPct,
        chargerKw,
        tariffEurPerKwh: tariff,
        consumptionKwhPer100km: defaults.consumption,
      }),
    [batteryKwh, fromPct, toPct, chargerKw, tariff, defaults.consumption],
  );

  if (!hydrated) return null;

  return (
    <section
      aria-labelledby="charging-planner-title"
      className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg)] p-4 shadow-sm space-y-4"
    >
      <div>
        <p className="text-[11px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
          {t('chargingPlanner.eyebrow')}
        </p>
        <h3 id="charging-planner-title" className="text-base font-semibold text-[var(--color-fg)]">
          {t('chargingPlanner.title')}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumField label={t('chargingPlanner.batteryKwh')} value={batteryKwh} setValue={setBatteryKwh} step={1} min={5} max={300} suffix="kWh" />
        <NumField label={t('chargingPlanner.tariff')} value={tariff} setValue={setTariff} step={0.01} min={0} max={2} suffix="€/kWh" />
        <NumField label={t('chargingPlanner.fromPct')} value={fromPct} setValue={setFromPct} step={1} min={0} max={99} suffix="%" />
        <NumField label={t('chargingPlanner.toPct')} value={toPct} setValue={setToPct} step={1} min={1} max={100} suffix="%" />
      </div>

      <div>
        <p className="text-[11px] text-[var(--color-fg-subtle)] mb-2">
          {t('chargingPlanner.chargerLabel')}
        </p>
        <div className="grid grid-cols-5 gap-1">
          {PRESETS_KW.map((p) => (
            <button
              key={p.kw}
              type="button"
              onClick={() => setChargerKw(p.kw)}
              className={`rounded-md px-1 py-1.5 text-[10px] font-medium border transition-colors
                         ${chargerKw === p.kw
                           ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 text-[var(--color-brand-600)]'
                           : 'border-[var(--color-border)] text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-hover)]'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[var(--color-border-subtle)]">
        <KpiCell label={t('chargingPlanner.energy')} value={`${result.energyKwh.toFixed(1)} kWh`} />
        <KpiCell
          label={t('chargingPlanner.duration')}
          value={result.durationMin >= 60
            ? `${Math.floor(result.durationMin / 60)} h ${Math.round(result.durationMin % 60)} m`
            : `${Math.round(result.durationMin)} min`}
        />
        <KpiCell label={t('chargingPlanner.cost')} value={`${result.costEur.toFixed(2)} €`} />
      </div>

      {result.costPer100km != null && result.rangeKmGained != null && (
        <p className="text-[11px] text-[var(--color-fg-subtle)] text-center">
          {t('chargingPlanner.summary')
            .replace('{range}', result.rangeKmGained.toFixed(0))
            .replace('{cost100}', result.costPer100km.toFixed(2))
            .replace('{avg}', result.averagePowerKw.toFixed(0))}
        </p>
      )}
    </section>
  );
}

interface NumFieldProps {
  label: string;
  value: number;
  setValue: (n: number) => void;
  step: number;
  min: number;
  max: number;
  suffix: string;
}

function NumField({ label, value, setValue, step, min, max, suffix }: NumFieldProps) {
  return (
    <label className="block">
      <span className="block text-[11px] text-[var(--color-fg-subtle)] mb-1">{label}</span>
      <div className="relative">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) setValue(Math.min(max, Math.max(min, n)));
          }}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-sm tabular-nums
                     focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/40"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-fg-subtle)]">
          {suffix}
        </span>
      </div>
    </label>
  );
}

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-fg-subtle)]">{label}</p>
      <p className="text-lg font-bold tabular-nums text-[var(--color-fg)]">{value}</p>
    </div>
  );
}
