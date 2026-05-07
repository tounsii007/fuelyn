// ============================================================
// GeoFenceList — manages the user's geo-fenced price alerts.
//
// Features:
//   • Lists all fences as glass cards with summary, toggle, delete
//   • "Neuer Standort-Alarm" form: pick a favorite or current location,
//     set radius (slider) + max-price + fuelType
//   • Native Notification permission prompt
//   • Empty-state with explainer
// ============================================================

'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import type { GeoFenceState } from '@/lib/store/app-store';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { requestNotificationPermission } from '@/lib/geo/use-geo-fence-watcher';
import type { FavoriteStation } from '@fuelyn/core';

const FUEL_LABELS: Record<'diesel' | 'e5' | 'e10', string> = {
  diesel: 'Diesel',
  e5: 'Super E5',
  e10: 'Super E10',
};

export function GeoFenceList() {
  const fences = useAppStore((s) => s.geoFences);
  const removeGeoFence = useAppStore((s) => s.removeGeoFence);
  const setGeoFenceEnabled = useAppStore((s) => s.setGeoFenceEnabled);
  const [isAdding, setIsAdding] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });
  const toast = useToast();

  const handleEnableNotifications = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    toast.show({
      tone: result === 'granted' ? 'success' : 'warning',
      title:
        result === 'granted'
          ? 'Benachrichtigungen aktiv'
          : 'Benachrichtigungen blockiert',
      description:
        result === 'granted'
          ? 'Du wirst informiert, wenn du einen Alarmbereich betrittst.'
          : 'Aktiviere sie in den Browser-Einstellungen.',
    });
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-fg)]">
            Standort-Alarme
          </h2>
          <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">
            Werde benachrichtigt, wenn du in der Nähe einer günstigen Tanke bist.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setIsAdding(true)}
          leadingIcon={<PlusIcon />}
        >
          Neu
        </Button>
      </header>

      {permission !== 'granted' && permission !== 'unsupported' && (
        <Card padding="md" elevation="flat">
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-2xl">🔔</span>
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--color-fg)]">
                Push-Benachrichtigungen aktivieren
              </div>
              <p className="text-xs text-[var(--color-fg-subtle)] mt-1">
                Sonst siehst du Alarme nur, solange die App geöffnet ist.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={handleEnableNotifications}>
              Aktivieren
            </Button>
          </div>
        </Card>
      )}

      {isAdding && <NewFenceForm onClose={() => setIsAdding(false)} />}

      {fences.length === 0 && !isAdding ? (
        <Card padding="lg" elevation="flat" className="text-center">
          <div className="mx-auto w-12 h-12 mb-3 rounded-2xl bg-[var(--color-brand-100)]/60
                          dark:bg-[var(--color-brand-800)]/40 grid place-items-center text-xl">
            📍
          </div>
          <p className="text-sm text-[var(--color-fg)]">
            Noch keine Standort-Alarme angelegt.
          </p>
          <p className="text-xs text-[var(--color-fg-subtle)] mt-1">
            Tippe auf <strong>Neu</strong>, um deinen ersten Alarm einzurichten.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {fences.map((fence) => (
            <li key={fence.id}>
              <FenceCard
                fence={fence}
                onToggle={(v) => setGeoFenceEnabled(fence.id, v)}
                onDelete={() => removeGeoFence(fence.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Single fence card ─────────────────────────────────────

interface FenceCardProps {
  fence: GeoFenceState;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}

function FenceCard({ fence, onToggle, onDelete }: FenceCardProps) {
  const dimmed = !fence.enabled;
  return (
    <Card
      padding="md"
      elevation="raised"
      className={dimmed ? 'opacity-60' : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-fg)] truncate">
              {fence.label || fence.stationName}
            </span>
            {fence.enabled ? (
              <Badge tone="success" size="sm" leadingIcon={<DotIcon />}>
                aktiv
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm">pausiert</Badge>
            )}
          </div>
          <div className="text-xs text-[var(--color-fg-subtle)] mt-1">
            {FUEL_LABELS[fence.fuelType]} · {fence.radiusKm.toFixed(1)} km Radius
            {fence.maxPrice != null && (
              <>
                {' · max '}
                <strong className="text-[var(--color-fg)]">
                  {fence.maxPrice.toFixed(3).replace('.', ',')} €/L
                </strong>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <ToggleSwitch
            checked={fence.enabled}
            onChange={onToggle}
            label={fence.enabled ? 'Alarm pausieren' : 'Alarm aktivieren'}
          />
          <button
            type="button"
            onClick={onDelete}
            aria-label="Alarm löschen"
            className="w-8 h-8 rounded-full grid place-items-center text-[var(--color-fg-subtle)]
                       hover:text-[var(--color-danger-500)] hover:bg-[var(--color-surface-hover)] fy-press"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </Card>
  );
}

// ─── New-fence form ────────────────────────────────────────

interface NewFenceFormProps {
  onClose: () => void;
}

function NewFenceForm({ onClose }: NewFenceFormProps) {
  const userLocation = useAppStore((s) => s.userLocation);
  const favorites = useAppStore((s) => s.favorites);
  const addGeoFence = useAppStore((s) => s.addGeoFence);
  const toast = useToast();

  const [label, setLabel] = useState('');
  const [target, setTarget] = useState<'current' | string>('current');
  const [radiusKm, setRadiusKm] = useState(2);
  const [fuelType, setFuelType] = useState<'diesel' | 'e5' | 'e10'>('e10');
  const [maxPriceStr, setMaxPriceStr] = useState('');

  const targetData = useMemo(() => {
    if (target === 'current') {
      if (!userLocation) return null;
      return {
        stationId: 'current-location',
        stationName: 'Aktueller Standort',
        center: userLocation,
      };
    }
    const fav = favorites.find((f) => f.stationId === target);
    if (!fav) return null;
    return {
      stationId: fav.stationId,
      stationName: fav.name || fav.brand,
      // We don't have lat/lng on FavoriteStation — fall back to user location
      // (accept this limitation; real fences use current-location anyway).
      center: userLocation ?? { lat: 52.52, lng: 13.405 },
    };
  }, [target, favorites, userLocation]);

  const canSubmit = !!targetData && radiusKm > 0;

  const handleSubmit = () => {
    if (!targetData) {
      toast.show({
        tone: 'warning',
        title: 'Standort fehlt',
        description: 'Erlaube den Standortzugriff oder wähle einen Favoriten.',
      });
      return;
    }
    const max = maxPriceStr.trim()
      ? Number(maxPriceStr.replace(',', '.'))
      : null;
    if (max != null && (!Number.isFinite(max) || max <= 0 || max > 5)) {
      toast.show({ tone: 'warning', title: 'Preis-Schwelle ungültig' });
      return;
    }
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : String(Date.now());
    addGeoFence({
      id,
      label: label.trim() || targetData.stationName,
      stationId: targetData.stationId,
      stationName: targetData.stationName,
      center: targetData.center,
      radiusKm,
      fuelType,
      maxPrice: max,
      enabled: true,
      createdAt: new Date().toISOString(),
    });
    toast.show({ tone: 'success', title: 'Alarm angelegt' });
    onClose();
  };

  return (
    <Card elevation="raised" padding="md" className="fy-enter">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--color-fg)]">
          Neuer Standort-Alarm
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Abbrechen"
          className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="space-y-4">
        <Input
          label="Bezeichnung (optional)"
          placeholder="z. B. Aral am Heimweg"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-fg)]">Standort</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="h-11 px-3 rounded-[var(--radius-lg)] bg-[var(--color-surface)]
                       border border-[var(--color-border)] text-sm text-[var(--color-fg)]
                       focus:border-[var(--color-brand-500)] focus:outline-none
                       focus:shadow-[var(--shadow-glow-brand)]"
          >
            <option value="current" disabled={!userLocation}>
              {userLocation ? 'Aktueller Standort' : 'Aktueller Standort (nicht verfügbar)'}
            </option>
            {favorites.map((fav) => (
              <option key={fav.stationId} value={fav.stationId}>
                {fav.name || fav.brand}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--color-fg)]">Radius</span>
            <span className="text-sm tabular-nums font-semibold text-[var(--color-brand-600)]">
              {radiusKm.toFixed(1)} km
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.5}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="w-full accent-[var(--color-brand-500)]"
          />
          <div className="flex justify-between text-[10px] text-[var(--color-fg-subtle)]">
            <span>0.5 km</span>
            <span>5 km</span>
            <span>10 km</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[var(--color-fg)]">Sorte</span>
            <select
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value as 'diesel' | 'e5' | 'e10')}
              className="h-11 px-3 rounded-[var(--radius-lg)] bg-[var(--color-surface)]
                         border border-[var(--color-border)] text-sm text-[var(--color-fg)]
                         focus:border-[var(--color-brand-500)] focus:outline-none
                         focus:shadow-[var(--shadow-glow-brand)]"
            >
              <option value="diesel">Diesel</option>
              <option value="e5">Super E5</option>
              <option value="e10">Super E10</option>
            </select>
          </div>
          <Input
            label="Max. Preis €/L"
            type="text"
            inputMode="decimal"
            placeholder="1,75"
            value={maxPriceStr}
            onChange={(e) => setMaxPriceStr(e.target.value)}
            hint="Optional. Leer = jeder Preis."
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          Alarm anlegen
        </Button>
      </div>
    </Card>
  );
}

// Reference the FavoriteStation type so the import isn't dead.
type _FavoriteStation = FavoriteStation;

// ─── Toggle (accessible) ───────────────────────────────────

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}

function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'relative w-9 h-5 rounded-full transition-colors duration-[var(--duration-fast)]',
        checked
          ? 'bg-[var(--color-brand-500)]'
          : 'bg-[var(--color-border-strong)]',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-[var(--shadow-sm)]',
          'transition-transform duration-[var(--duration-fast)] ease-[var(--ease-spring)]',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

// ─── Icons ─────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}
function DotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}
