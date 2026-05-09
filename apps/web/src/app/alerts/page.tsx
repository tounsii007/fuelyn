// ============================================================
// Price Alerts Page
// ============================================================

'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { FUEL_TYPE_LABELS } from '@fuelyn/core';
import type { FuelType, PriceAlert } from '@fuelyn/core';
import { EmptyState } from '@/components/ui/EmptyState';
import { GeoFenceList } from '@/components/alerts/GeoFenceList';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { IconButton } from '@/components/ui/IconButton';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';

export default function AlertsPage() {
  const alerts = useAppStore((s) => s.priceAlerts);
  const addPriceAlert = useAppStore((s) => s.addPriceAlert);
  const removePriceAlert = useAppStore((s) => s.removePriceAlert);
  const togglePriceAlert = useAppStore((s) => s.togglePriceAlert);
  const setPriceAlerts = useAppStore((s) => s.setPriceAlerts);

  const [isAdding, setIsAdding] = useState(false);
  const [fuelType, setFuelType] = useState<FuelType>('e10');
  const [targetPrice, setTargetPrice] = useState(1.6);

  // Quick aggregates for the summary strip + bulk actions.
  const armedCount = alerts.filter((a) => a.enabled).length;
  const pausedCount = alerts.length - armedCount;

  /** Toggle every alert ON or OFF in one go. Used by the
   *  "Alle aktivieren" / "Alle pausieren" bulk button so the
   *  user can flip the whole set without N taps. */
  const setAllEnabled = useCallback(
    (enabled: boolean) => {
      setPriceAlerts(alerts.map((a) => ({ ...a, enabled })));
    },
    [alerts, setPriceAlerts],
  );

  const handleAdd = useCallback(() => {
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) return;
    addPriceAlert({
      id: crypto.randomUUID(),
      fuelType,
      targetPrice,
      enabled: true,
      createdAt: new Date().toISOString(),
    });
    setIsAdding(false);
  }, [fuelType, targetPrice, addPriceAlert]);

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade-in">
      <PageHeader
        title="Preisalarme"
        action={
          !isAdding && (
            <Button onClick={() => setIsAdding(true)} size="sm" leadingIcon={<PlusIcon />}>
              Neuer Alarm
            </Button>
          )
        }
      />

      {/* Add Alert Form */}
      {isAdding && (
        <section
          aria-labelledby="new-alert-heading"
          className="bg-white dark:bg-gray-800/90 rounded-2xl shadow-card
                     border border-gray-100 dark:border-gray-700/60
                     p-5 mb-4 animate-slide-down"
        >
          <h3
            id="new-alert-heading"
            className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4"
          >
            Neuer Preisalarm
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Select
              label="Kraftstoff"
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value as FuelType)}
            >
              {Object.entries(FUEL_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Input
              label="Wunschpreis (€/L)"
              type="number"
              value={targetPrice}
              onChange={(e) => setTargetPrice(Math.max(0, Number(e.target.value) || 0))}
              step={0.01}
              min={0.5}
              max={3.0}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} fullWidth>
              Erstellen
            </Button>
            <Button variant="secondary" onClick={() => setIsAdding(false)}>
              Abbrechen
            </Button>
          </div>
        </section>
      )}

      {/* Alert List */}
      {alerts.length === 0 ? (
        <EmptyState
          title="Keine Preisalarme"
          message="Erstelle einen Alarm und werde benachrichtigt, wenn der Preis unter deinen Wunschpreis fällt."
        />
      ) : (
        <>
          {/*
            Summary strip — at-a-glance "wie viele Alarme laufen
            gerade" plus a one-tap bulk toggle. Beats N individual
            toggles when the user goes on holiday / wants to mute
            everything for a while.
          */}
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl
                          bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
            <div className="text-xs text-gray-600 dark:text-gray-300 tabular-nums">
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                {armedCount}
              </span>{' '}
              aktiv
              {pausedCount > 0 && (
                <>
                  {' · '}
                  <span className="text-gray-500 dark:text-gray-400">{pausedCount} pausiert</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAllEnabled(armedCount === 0)}
              className="text-xs font-semibold text-brand-700 dark:text-brand-300
                         hover:bg-brand-50 dark:hover:bg-brand-900/30
                         rounded-lg px-2 py-1 transition-colors"
              title={
                armedCount === 0
                  ? 'Alle Alarme aktivieren'
                  : 'Alle Alarme vorübergehend pausieren'
              }
            >
              {armedCount === 0 ? 'Alle aktivieren' : 'Alle pausieren'}
            </button>
          </div>

          <div className="space-y-3">
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onToggle={() => togglePriceAlert(alert.id)}
                onRemove={() => removePriceAlert(alert.id)}
              />
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400 mt-6 text-center">
        Alarme werden beim nächsten Öffnen der App geprüft.
      </p>

      {/* Geo-fenced alerts */}
      <div className="mt-10">
        <GeoFenceList />
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  onToggle,
  onRemove,
}: {
  alert: PriceAlert;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const fuelColor =
    alert.fuelType === 'diesel'
      ? 'bg-fuel-diesel'
      : alert.fuelType === 'e5'
        ? 'bg-fuel-e5'
        : 'bg-fuel-e10';

  return (
    <article
      className={`bg-white dark:bg-gray-800/90 rounded-2xl shadow-card
                  border border-gray-100 dark:border-gray-700/60
                  p-4 flex items-center gap-4 transition-opacity
                  ${!alert.enabled ? 'opacity-60' : ''}`}
    >
      <span
        className={`w-3 h-3 rounded-full ${fuelColor} flex-shrink-0`}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {FUEL_TYPE_LABELS[alert.fuelType]} unter {alert.targetPrice.toFixed(2)} €
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Erstellt am {new Date(alert.createdAt).toLocaleDateString('de-DE')}
        </p>
      </div>
      <ToggleSwitch
        checked={alert.enabled}
        onChange={() => onToggle()}
        aria-label={alert.enabled ? 'Alarm deaktivieren' : 'Alarm aktivieren'}
      />
      <IconButton tone="danger" onClick={onRemove} aria-label="Alarm löschen">
        <TrashIcon />
      </IconButton>
    </article>
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

function TrashIcon() {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}
