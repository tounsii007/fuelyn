// ============================================================
// Saved Locations Page — Standort-Lesezeichen
// ============================================================

'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store/app-store';
import type { SavedLocation } from '@tankpilot/core';
import { EmptyState } from '@/components/ui/EmptyState';

const ICONS: { value: SavedLocation['icon']; label: string; emoji: string }[] = [
  { value: 'home', label: 'Zuhause', emoji: '\uD83C\uDFE0' },
  { value: 'work', label: 'Arbeit', emoji: '\uD83C\uDFE2' },
  { value: 'star', label: 'Favorit', emoji: '\u2B50' },
  { value: 'pin', label: 'Sonstiges', emoji: '\uD83D\uDCCD' },
];

export default function LocationsPage() {
  const locations = useAppStore((s) => s.savedLocations);
  const addSavedLocation = useAppStore((s) => s.addSavedLocation);
  const removeSavedLocation = useAppStore((s) => s.removeSavedLocation);
  const setUserLocation = useAppStore((s) => s.setUserLocation);

  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<SavedLocation['icon']>('home');
  const [lat, setLat] = useState(52.52);
  const [lng, setLng] = useState(13.405);

  const handleAdd = useCallback(() => {
    const trimmedName = name.trim();
    if (
      !trimmedName ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) return;
    addSavedLocation({ id: crypto.randomUUID(), name: trimmedName, lat, lng, icon });
    setIsAdding(false);
    setName('');
  }, [name, lat, lng, icon, addSavedLocation]);

  const useCurrentLocation = useCallback(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setLat(Math.round(pos.coords.latitude * 10000) / 10000);
        setLng(Math.round(pos.coords.longitude * 10000) / 10000);
      },
      () => {},
      { enableHighAccuracy: false, timeout: 5000 },
    );
  }, []);

  const handleUseLocation = useCallback((loc: SavedLocation) => {
    setUserLocation({ lat: loc.lat, lng: loc.lng });
    window.location.href = '/';
  }, [setUserLocation]);

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade-in">
      <Link href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Zur&uuml;ck
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Meine Orte</h1>
        <button type="button" onClick={() => setIsAdding(true)}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors">
          + Ort hinzuf&uuml;gen
        </button>
      </div>

      {isAdding && (
        <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5 mb-4 animate-slide-down">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">Neuer Ort</h3>
          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Zuhause"
                className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
                           bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">Symbol</label>
              <div className="flex gap-2">
                {ICONS.map((ic) => (
                  <button key={ic.value} type="button" onClick={() => setIcon(ic.value)}
                    className={`flex-1 py-2 rounded-xl text-center text-sm transition-all border-2
                      ${icon === ic.value
                        ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20'
                        : 'border-gray-100 dark:border-gray-700'}`}>
                    <span className="text-lg">{ic.emoji}</span>
                    <p className="text-[10px] text-gray-500 mt-0.5">{ic.label}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Breitengrad</label>
                <input type="number" value={lat} onChange={(e) => setLat(Number(e.target.value) || 0)} step={0.0001}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
                             bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                             focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">L&auml;ngengrad</label>
                <input type="number" value={lng} onChange={(e) => setLng(Number(e.target.value) || 0)} step={0.0001}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
                             bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                             focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
            <button type="button" onClick={useCurrentLocation}
              className="text-xs text-brand-600 hover:text-brand-700">
              Aktuellen Standort verwenden
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleAdd}
              className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors">
              Speichern
            </button>
            <button type="button" onClick={() => setIsAdding(false)}
              className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm rounded-xl
                         hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {locations.length === 0 ? (
        <EmptyState
          title="Keine gespeicherten Orte"
          message="Speichere h&auml;ufig besuchte Orte f&uuml;r schnellen Zugriff."
        />
      ) : (
        <div className="space-y-3">
          {locations.map((loc) => {
            const iconData = ICONS.find((i) => i.value === loc.icon);
            return (
              <div key={loc.id}
                className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-4 flex items-center gap-4">
                <span className="text-2xl">{iconData?.emoji || '\uD83D\uDCCD'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{loc.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                  </p>
                </div>
                <button type="button" onClick={() => handleUseLocation(loc)}
                  className="px-3 py-1.5 bg-brand-50 dark:bg-brand-900/20 text-brand-600 text-xs font-medium rounded-lg
                             hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors">
                  Verwenden
                </button>
                <button type="button" onClick={() => removeSavedLocation(loc.id)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
