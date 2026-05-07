// ============================================================
// AddressSearch — geocoding by street, postcode, city, or POI.
//
// Features:
//   • Up to 25 hits per query, deutschlandweit (Nominatim, country=de)
//   • Structured display: primary line (street / city / POI) +
//     secondary line (postcode · city · state)
//   • Grouped by class (Adresse · PLZ · Stadt · Ort) so a long list
//     of "Bahnhofstraße" hits stays scannable
//   • Type-icon per result (📍 street, 🏷 PLZ, 🏙 city, 📌 POI)
//   • Keyboard navigation: ↑↓ to highlight, Enter to select, Esc to close
//   • Debounced (250 ms) + AbortController → only the latest query
//     resolves, no race conditions
//   • Scrollable list (max-h) so 25 hits don't overflow the panel
// ============================================================

'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useGeolocation } from '@/lib/hooks/use-location';
import { fetchJson } from '@/lib/http/fetch-json';

interface NominatimAddress {
  readonly road?: string;
  readonly house_number?: string;
  readonly postcode?: string;
  readonly city?: string;
  readonly town?: string;
  readonly village?: string;
  readonly municipality?: string;
  readonly suburb?: string;
  readonly state?: string;
  readonly country?: string;
}

interface SearchResult {
  readonly place_id: number;
  readonly display_name: string;
  readonly lat: string;
  readonly lon: string;
  readonly class?: string;
  readonly type?: string;
  readonly address?: NominatimAddress;
}

/** Reverse-geocoding response shape (a single SearchResult-ish record). */
interface ReverseGeocodeResult {
  readonly display_name: string;
  readonly address?: NominatimAddress;
}

const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

/**
 * Format a reverse-geocode hit into a single-line label that fits the
 * search input. Prefers structured pieces in this order:
 *   road [house_number], postcode city, state
 * Falls back to display_name for unknown shapes.
 */
function formatReverseLabel(r: ReverseGeocodeResult): string {
  const a = r.address ?? {};
  const cityLike = a.city ?? a.town ?? a.village ?? a.municipality ?? '';
  const street = a.road ? `${a.road}${a.house_number ? ' ' + a.house_number : ''}` : '';
  const tail = [a.postcode, cityLike].filter(Boolean).join(' ');
  const main = [street, tail].filter(Boolean).join(', ');
  if (main) return main;
  // Last resort: trim Nominatim's chatty display_name to first 3 segments.
  return r.display_name.split(',').slice(0, 3).map((s) => s.trim()).filter(Boolean).join(', ');
}

type ResultGroup = 'Adresse' | 'PLZ' | 'Stadt' | 'Ort';

interface FormattedResult {
  readonly raw: SearchResult;
  readonly group: ResultGroup;
  readonly icon: string;
  readonly primary: string;
  readonly secondary: string;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const RESULT_LIMIT = 25;
const DEBOUNCE_MS = 250;

function classifyResult(r: SearchResult): { group: ResultGroup; icon: string } {
  const cls = r.class ?? '';
  const type = r.type ?? '';

  // Postal code lookup (numeric query) — Nominatim returns class=place type=postcode
  if (type === 'postcode' || cls === 'postcode') {
    return { group: 'PLZ', icon: '🏷' };
  }
  if (cls === 'highway' || cls === 'place' && (type === 'house' || type === 'address')) {
    return { group: 'Adresse', icon: '📍' };
  }
  if (
    cls === 'place' &&
    (type === 'city' || type === 'town' || type === 'village' || type === 'municipality' || type === 'hamlet')
  ) {
    return type === 'city' || type === 'town' ? { group: 'Stadt', icon: '🏙' } : { group: 'Ort', icon: '📌' };
  }
  // Streets without explicit class === 'highway'
  if (r.address?.road) {
    return { group: 'Adresse', icon: '📍' };
  }
  // Standalone postal codes occasionally come back via address.postcode
  if (r.address?.postcode && !r.address.road) {
    return { group: 'PLZ', icon: '🏷' };
  }
  return { group: 'Ort', icon: '📌' };
}

function formatResult(r: SearchResult): FormattedResult {
  const { group, icon } = classifyResult(r);
  const a = r.address ?? {};

  const cityLike = a.city ?? a.town ?? a.village ?? a.municipality ?? '';
  const state = a.state ?? '';

  let primary: string;
  let secondary: string;

  if (group === 'Adresse') {
    const houseNumber = a.house_number ? ` ${a.house_number}` : '';
    primary = `${a.road ?? r.display_name.split(',')[0] ?? ''}${houseNumber}`.trim();
    secondary = [a.postcode, cityLike, state].filter(Boolean).join(' · ');
  } else if (group === 'PLZ') {
    primary = a.postcode ?? r.display_name.split(',')[0] ?? '';
    secondary = [cityLike, state].filter(Boolean).join(' · ');
  } else {
    primary = cityLike || r.display_name.split(',')[0] || '';
    secondary = [a.postcode, state].filter(Boolean).join(' · ');
  }

  // Fallback if Nominatim didn't return a structured address
  if (!primary) primary = r.display_name.split(',')[0] ?? r.display_name;
  if (!secondary) {
    secondary = r.display_name.split(',').slice(1, 4).map((s) => s.trim()).filter(Boolean).join(' · ');
  }

  return { raw: r, group, icon, primary, secondary };
}

const GROUP_ORDER: ResultGroup[] = ['Adresse', 'PLZ', 'Stadt', 'Ort'];

// ─── GeolocateButton ───────────────────────────────────────
//
// Compact "use my location" button that lives inside the search
// input's right rail. Drives a four-state visual machine:
//
//   idle      → outlined crosshair, brand-blue on hover
//   locating  → animated pulse around a filled dot
//   success   → check-mark, briefly green
//   denied    → strike-through crosshair, amber

interface GeolocateButtonProps {
  readonly state: GeoState;
  readonly onClick: () => void;
}

function GeolocateButton({ state, onClick }: GeolocateButtonProps) {
  const baseClasses =
    'w-7 h-7 inline-flex items-center justify-center rounded-lg ' +
    'transition-colors focus:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-brand-500/40';

  const toneClasses = {
    idle: 'text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/30',
    locating: 'text-brand-600 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30',
    success: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
    denied: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30',
  } as const;

  const labels = {
    idle: 'Aktuellen Standort verwenden',
    locating: 'Standort wird ermittelt…',
    success: 'Standort übernommen',
    denied: 'Standort nicht verfügbar — erneut versuchen',
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      title={labels[state]}
      aria-label={labels[state]}
      aria-busy={state === 'locating' || undefined}
      disabled={state === 'locating'}
      className={`${baseClasses} ${toneClasses[state]} ${state === 'locating' ? 'cursor-progress' : ''}`}
    >
      {state === 'locating' ? <CrosshairLocating /> : state === 'success' ? <CheckIcon /> : state === 'denied' ? <CrosshairDenied /> : <CrosshairIcon />}
    </button>
  );
}

function CrosshairIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

function CrosshairLocating() {
  return (
    <span className="relative inline-flex w-4 h-4 items-center justify-center" aria-hidden="true">
      <span className="absolute inset-0 rounded-full bg-current opacity-30 animate-ping" />
      <span className="relative w-2 h-2 rounded-full bg-current" />
    </span>
  );
}

function CrosshairDenied() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M5 5l14 14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.4}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5 9-11" />
    </svg>
  );
}

type GeoState = 'idle' | 'locating' | 'success' | 'denied';

export function AddressSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FormattedResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [geoState, setGeoState] = useState<GeoState>('idle');
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  const userLocation = useAppStore((s) => s.userLocation);
  const { requestLocation, permission, insecureContext } = useGeolocation();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const geoRequestedAtRef = useRef<number | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (q: string) => {
    const normalizedQuery = q.trim();
    if (normalizedQuery.length < 2) {
      abortRef.current?.abort();
      setResults([]);
      setIsOpen(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: normalizedQuery,
        format: 'json',
        countrycodes: 'de',
        limit: String(RESULT_LIMIT),
        addressdetails: '1',
        'accept-language': 'de',
        dedupe: '1',
      });
      const data = await fetchJson<SearchResult[]>(
        `${NOMINATIM_BASE}?${params.toString()}`,
        { signal: controller.signal, timeoutMs: 8000 },
      );
      const seen = new Set<string>();
      const formatted = data
        .map(formatResult)
        .filter((f) => {
          // Deduplicate by primary+secondary; Nominatim's `dedupe=1` is
          // not perfect for streets that exist in multiple suburbs.
          const key = `${f.primary}|${f.secondary}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      setResults(formatted);
      setIsOpen(formatted.length > 0);
      setActiveIndex(0);
    } catch {
      if (controller.signal.aborted) return;
      setResults([]);
      setIsOpen(false);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), DEBOUNCE_MS);
  };

  /**
   * Reverse-geocode a coordinate pair and write a human-readable
   * label into the search input so the user sees what was detected.
   * Best-effort: failures fall back to the existing query state.
   */
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'json',
      addressdetails: '1',
      'accept-language': 'de',
      zoom: '14', // city-block level
    });
    try {
      const data = await fetchJson<ReverseGeocodeResult>(
        `${NOMINATIM_REVERSE}?${params.toString()}`,
        { timeoutMs: 6000 },
      );
      setQuery(formatReverseLabel(data));
    } catch {
      // Silent — userLocation is already set; the label is just polish.
    }
  }, []);

  /**
   * Trigger native geolocation on demand. Drives a small state machine
   * to give the button a visible "locating → success / denied" rhythm
   * even on fast networks.
   */
  const handleUseCurrentLocation = useCallback(() => {
    if (geoState === 'locating') return; // already in flight
    setGeoState('locating');
    setGeoMessage(null);
    geoRequestedAtRef.current = Date.now();
    setIsOpen(false);
    // Delegate to the shared hook, which handles permission states,
    // insecure-context fallback (Berlin) and store updates.
    requestLocation();
  }, [geoState, requestLocation]);

  // Watch for location changes triggered by our button click and
  // settle the local state machine accordingly.
  useEffect(() => {
    if (geoState !== 'locating') return;
    // Permission was rejected mid-request → show error state
    if (permission === 'denied') {
      setGeoState('denied');
      setGeoMessage(
        insecureContext
          ? 'Standort nur über HTTPS verfügbar.'
          : 'Standortzugriff verweigert.',
      );
      return;
    }
    // We've got coordinates after the request started → success
    if (
      userLocation &&
      geoRequestedAtRef.current &&
      Date.now() - geoRequestedAtRef.current < 30_000
    ) {
      setGeoState('success');
      setGeoMessage(null);
      void reverseGeocode(userLocation.lat, userLocation.lng);
      // Auto-fade the success indicator back to idle
      const t = setTimeout(() => setGeoState('idle'), 1_800);
      return () => clearTimeout(t);
    }
    // 12 s timeout → stop spinning, show neutral idle again
    const fallback = setTimeout(() => {
      setGeoState((s) => (s === 'locating' ? 'idle' : s));
    }, 12_000);
    return () => clearTimeout(fallback);
  }, [geoState, permission, userLocation, reverseGeocode, insecureContext]);

  const handleSelect = useCallback(
    (result: FormattedResult) => {
      const lat = Number.parseFloat(result.raw.lat);
      const lng = Number.parseFloat(result.raw.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      setUserLocation({ lat, lng });
      setQuery(result.primary);
      setIsOpen(false);
      setResults([]);
    },
    [setUserLocation],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) {
      if (e.key === 'ArrowDown' && results.length > 0) {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[activeIndex];
      if (r) handleSelect(r);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Keep highlighted item in view while navigating with the keyboard.
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLButtonElement>(
      `[data-result-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  // Group consecutively for display while preserving Nominatim's relevance order.
  const grouped = useMemo(() => {
    const buckets = new Map<ResultGroup, FormattedResult[]>();
    for (const g of GROUP_ORDER) buckets.set(g, []);
    for (const r of results) buckets.get(r.group)?.push(r);
    return GROUP_ORDER.map((g) => ({ group: g, items: buckets.get(g) ?? [] }))
      .filter((b) => b.items.length > 0);
  }, [results]);

  // Build flat→original-index lookup for highlighted state.
  const flatIndexByPlaceId = useMemo(() => {
    const map = new Map<number, number>();
    results.forEach((r, i) => map.set(r.raw.place_id, i));
    return map;
  }, [results]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        {/* Search icon (left) */}
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>

        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Ort, PLZ oder Adresse..."
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-activedescendant={
            isOpen && results[activeIndex]
              ? `addr-result-${results[activeIndex].raw.place_id}`
              : undefined
          }
          /* pr-20: enough room for both the X-clear button (when shown)
             and the always-present geolocation button on the right. */
          className="w-full pl-9 pr-20 py-2 text-sm rounded-xl
                     border border-gray-200 dark:border-gray-700
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                     placeholder:text-gray-400 dark:placeholder:text-gray-500
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30
                     focus:border-brand-500 transition-all"
        />

        {/* Trailing controls — clear · search-spinner · geolocate */}
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {loading ? (
            <span
              aria-label="Suche läuft"
              className="w-7 h-7 inline-flex items-center justify-center"
            >
              <span className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-brand-500 rounded-full animate-spin" />
            </span>
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
                setIsOpen(false);
              }}
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg
                         text-gray-400 dark:text-gray-500
                         hover:text-gray-700 dark:hover:text-gray-200
                         hover:bg-gray-100 dark:hover:bg-gray-700/60
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40
                         transition-colors"
              aria-label="Eingabe löschen"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}

          <GeolocateButton state={geoState} onClick={handleUseCurrentLocation} />
        </div>
      </div>

      {/* Geolocation feedback banner (denied / fallback / etc.) */}
      {geoMessage && (
        <p
          role="status"
          className="mt-1.5 text-xs text-amber-700 dark:text-amber-300
                     bg-amber-50 dark:bg-amber-900/30
                     border border-amber-200 dark:border-amber-800/60
                     rounded-lg px-2.5 py-1.5"
        >
          {geoMessage}
        </p>
      )}

      {isOpen && results.length > 0 && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-gray-800
                     rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-y-auto
                     max-h-[420px] scrollbar-hide"
        >
          {/* Result counter */}
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider
                          text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/60 sticky top-0 z-10">
            {results.length} {results.length === 1 ? 'Treffer' : 'Treffer'} · deutschlandweit
          </div>

          {grouped.map(({ group, items }) => (
            <div key={group}>
              {grouped.length > 1 && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider
                                text-gray-400 dark:text-gray-500">
                  {group}
                </div>
              )}
              {items.map((r) => {
                const flatIdx = flatIndexByPlaceId.get(r.raw.place_id) ?? -1;
                const isActive = flatIdx === activeIndex;
                return (
                  <button
                    key={r.raw.place_id}
                    id={`addr-result-${r.raw.place_id}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-result-index={flatIdx}
                    onMouseEnter={() => setActiveIndex(flatIdx)}
                    onClick={() => handleSelect(r)}
                    className={`w-full text-left px-3 py-2.5 text-sm transition-colors
                                flex items-start gap-2.5 border-l-2
                                ${isActive
                                  ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-500'
                                  : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/60'
                                }`}
                  >
                    <span className="text-base leading-none mt-0.5 flex-shrink-0" aria-hidden="true">
                      {r.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-gray-800 dark:text-gray-100 truncate">
                        {r.primary}
                      </span>
                      {r.secondary && (
                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                          {r.secondary}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* "No results" toast inside the dropdown */}
      {isOpen && results.length === 0 && !loading && query.trim().length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-gray-800
                        rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Keine Treffer für „{query}".
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Versuche eine andere Schreibweise oder eine Postleitzahl.
          </p>
        </div>
      )}
    </div>
  );
}
