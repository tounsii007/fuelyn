// ============================================================
// AppShell — modern, glass-morphic, sticky shell with hover-grow
// nav buttons, command-palette trigger, and segmented quick-controls.
//
// The fuel-type and radius pickers used to be native <select>s; the
// browser renders <option> children with OS defaults, which on dark
// glass produces unreadable black-on-black text. They're now real
// custom popovers so the dropdown items pick up our tokens.
// ============================================================

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CompareTray } from '@/components/stations/CompareTray';
import { useAppStore } from '@/lib/store/app-store';
import { FUEL_TYPE_LABELS, RADIUS_OPTIONS_KM } from '@fuelyn/core';
import type { FuelType } from '@fuelyn/core';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useTheme } from '@/lib/theme/ThemeProvider';

export function AppShell({ children }: { children: React.ReactNode }) {
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const setFuelType = useAppStore((s) => s.setFuelType);
  const radiusKm = useAppStore((s) => s.filter.radiusKm);
  const setFilter = useAppStore((s) => s.setFilter);
  const isMapView = useAppStore((s) => s.isMapView);
  const toggleView = useAppStore((s) => s.toggleView);

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="flex flex-col h-screen relative isolate">
      {/* Decorative animated mesh gradient — fixed behind everything */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 fy-mesh fy-mesh-animated"
      />
      {/* Subtle grain layer for tactility */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%27160%27 height=%27160%27><filter id=%27n%27><feTurbulence baseFrequency=%270.9%27 numOctaves=%273%27 stitchTiles=%27stitch%27/></filter><rect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/></svg>")',
        }}
      />

      {/* Header — sticky, glass-morphic, shrinks subtly on scroll.
           z-[1200] keeps the header (and any dropdowns it spawns —
           the notification bell, fuel/radius pickers, etc.) above
           Leaflet's map controls which render at z-[1000]. Without
           this the bell-dropdown rendered behind the map's zoom
           column on the right edge. */}
      <header
        className={[
          'sticky top-0 z-[1200] transition-all duration-200',
          scrolled
            ? 'fy-glass shadow-[var(--shadow-sm)] border-b border-[var(--color-border-subtle)]'
            : 'bg-transparent border-b border-transparent',
        ].join(' ')}
      >
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Brand />

          {/* Three logical groups separated by dividers:
              ┌─────────┐ │ ┌──────────────────┐ │ ┌──────────┐ │ ┌──────────────┐ │ ┌─────┐
              │ Search  │ │ │ Fuel · Radius    │ │ │ View     │ │ │ Personal     │ │ │ More│
              └─────────┘ │ └──────────────────┘ │ └──────────┘ │ └──────────────┘ │ └─────┘ */}
          <nav aria-label="Hauptnavigation" className="flex items-center gap-1.5">
            <CommandTrigger />

            <Divider />

            <PopoverSelect
              icon={<FuelIcon />}
              value={fuelType}
              onChange={(v) => setFuelType(v as FuelType)}
              options={Object.entries(FUEL_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              ariaLabel="Kraftstoffart wählen"
            />
            <PopoverSelect
              icon={<RadiusIcon />}
              value={String(radiusKm)}
              onChange={(v) => setFilter({ radiusKm: Number(v) })}
              options={RADIUS_OPTIONS_KM.map((r) => ({ value: String(r), label: `${r} km` }))}
              ariaLabel="Suchradius wählen"
            />

            <Divider />

            <IconButton
              onClick={toggleView}
              label={isMapView ? 'Listenansicht anzeigen' : 'Kartenansicht anzeigen'}
            >
              {isMapView ? <ListIcon /> : <MapIcon />}
            </IconButton>

            <Divider />

            <IconLink href="/vehicle" label="Fahrzeug">
              <CarIcon />
            </IconLink>
            <IconLink href="/favorites" label="Favoriten">
              <HeartIcon />
            </IconLink>

            <NotificationBell />

            <Divider />

            <ThemeQuickToggle />

            <IconLink href="/settings" label="Einstellungen">
              <CogIcon />
            </IconLink>

            <MoreMenu />
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">{children}</main>

      {/*
        Floating compare-tray indicator. Mounts globally so it
        follows the user across pages (hidden when empty or when
        already on /compare). The component itself returns null
        until something is in the compare set, so this line costs
        nothing in the common case.
      */}
      <CompareTray />
    </div>
  );
}

// ─── Brand ─────────────────────────────────────────────────

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group" aria-label="Fuelyn Startseite">
      {/*
        Fuelyn glyph — abstract "F" cut from a fuel-drop silhouette.
        Lives inside a deep-navy → electric-blue → violet gradient
        with a soft ring-glow so the mark feels tactile and emissive
        in dark mode without being noisy in light mode.
      */}
      <span
        aria-hidden="true"
        className="relative w-9 h-9 rounded-2xl flex items-center justify-center
                   bg-gradient-to-br from-[var(--color-brand-400)] via-[var(--color-brand-600)] to-[var(--color-violet-500)]
                   text-white shadow-[var(--shadow-glow-brand)]
                   transition-transform duration-200 group-hover:scale-105 group-active:scale-95"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          {/* Drop silhouette */}
          <path
            d="M12 2.5c4.6 5.5 7 9.4 7 12.6a7 7 0 11-14 0c0-3.2 2.4-7.1 7-12.6Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* Lightning-F mark inside the drop */}
          <path
            d="M11 9h3.2l-3 3.6h2.4L10.4 18l.8-3.8H9.6L11 9Z"
            fill="currentColor"
          />
        </svg>
        {/* Hover sheen */}
        <span className="absolute inset-0 rounded-2xl bg-white/25 mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-bold tracking-tight fy-text-gradient">Fuelyn</span>
        <span className="text-[10px] font-medium text-[var(--color-fg-subtle)] mt-0.5">
          AI fuel intelligence
        </span>
      </span>
    </Link>
  );
}

// ─── Command palette trigger (⌘K) ────────────────────────

function CommandTrigger() {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('tp:open-command-palette'));
      }}
      aria-label="Schnellsuche öffnen"
      className="hidden md:inline-flex items-center gap-2 h-8 px-3 rounded-[var(--radius-pill)]
                 fy-glass-subtle text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]
                 border border-[var(--color-border)] fy-press
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]/40"
    >
      <SearchIcon />
      <span>Suchen</span>
      <kbd
        className="ml-1 hidden lg:inline-block text-[10px] font-mono text-[var(--color-fg-subtle)]
                   border border-[var(--color-border)] rounded px-1.5 py-0.5 leading-none"
      >
        ⌘K
      </kbd>
    </button>
  );
}

// ─── PopoverSelect — custom dropdown that picks up theme tokens ──
//
// Replaces the native <select>. Items render with our tokens so the
// dropdown is readable in both light and dark modes, and we get full
// keyboard support (Arrow keys + Enter + Escape) for free.

interface PopoverSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  icon: React.ReactNode;
  ariaLabel: string;
}

function PopoverSelect({ value, onChange, options, icon, ariaLabel }: PopoverSelectProps) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options.find((o) => o.value === value) ?? options[0];

  // Reset focus index whenever the popover opens.
  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setFocusIdx(idx === -1 ? 0 : idx);
  }, [open, options, value]);

  // Click-outside + Escape close.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Move keyboard focus to the active item whenever focusIdx changes.
  useEffect(() => {
    if (!open) return;
    itemsRef.current[focusIdx]?.focus();
  }, [open, focusIdx]);

  const handleTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusIdx(options.length - 1);
    } else if (e.key === 'Tab') {
      // Close on tab-out so focus continues naturally.
      setOpen(false);
    }
  };

  // Empty options list → render nothing (after all hooks, so React's
  // hook-order rule stays happy).
  if (!selected) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleTriggerKey}
        className={[
          'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--radius-pill)]',
          'fy-glass-subtle border transition-all',
          open
            ? 'border-[var(--color-brand-500)] shadow-[var(--shadow-glow-brand)]'
            : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]/40',
        ].join(' ')}
      >
        <span className="text-[var(--color-brand-600)]">{icon}</span>
        <span className="text-xs font-semibold text-[var(--color-fg)]">{selected.label}</span>
        <ChevronIcon
          className={`text-[var(--color-fg-subtle)] transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={handleListKey}
          className="absolute right-0 top-full mt-2 min-w-[8.5rem] z-50
                     bg-white dark:bg-gray-900
                     border border-gray-200 dark:border-gray-700/80
                     rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/5
                     p-1 fy-enter overflow-hidden"
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li key={o.value} role="none">
                <button
                  ref={(el) => {
                    itemsRef.current[i] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={focusIdx === i ? 0 : -1}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setFocusIdx(i)}
                  className={[
                    'w-full flex items-center justify-between gap-3',
                    'px-3 py-2 text-sm font-medium rounded-xl',
                    'transition-colors',
                    'focus:outline-none',
                    isSelected
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
                  ].join(' ')}
                >
                  <span>{o.label}</span>
                  {isSelected && <CheckIcon className="text-brand-600 dark:text-brand-300" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Icon button + link primitives ────────────────────────

function IconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-9 h-9 rounded-2xl flex items-center justify-center text-[var(--color-fg-subtle)]
                 hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-hover)] fy-press
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]/40
                 transition-colors"
    >
      {children}
    </button>
  );
}

function IconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="w-9 h-9 rounded-2xl flex items-center justify-center text-[var(--color-fg-subtle)]
                 hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-hover)] fy-press
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]/40
                 transition-colors"
    >
      {children}
    </Link>
  );
}

function Divider() {
  return (
    <span
      aria-hidden="true"
      className="hidden sm:block w-px h-5 bg-[var(--color-border)] mx-1 self-center"
    />
  );
}

// ─── Theme quick toggle (compact: just sun/moon) ──────────

function ThemeQuickToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <IconButton
      onClick={toggle}
      label={resolved === 'dark' ? 'Auf hellen Modus umschalten' : 'Auf dunklen Modus umschalten'}
    >
      {resolved === 'dark' ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}

// ─── More-menu (glass dropdown) ───────────────────────────

type MoreMenuItem =
  | { kind: 'link'; href: string; label: string; desc: string; icon: React.ReactNode }
  | { kind: 'action'; onClick: () => void; label: string; desc: string; icon: React.ReactNode };

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  // ─── Quick actions (no navigation, run in-place) ────────────
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* user cancelled or browser refused — silent */
    }
  }, []);

  const shareCurrentView = useCallback(async () => {
    const url = window.location.href;
    const data: ShareData = { title: document.title, url };
    try {
      if (navigator.share) {
        await navigator.share(data);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* user cancelled or browser refused — silent */
    }
  }, []);

  const reloadApp = useCallback(() => {
    window.location.reload();
  }, []);

  // Group menu items so the dropdown is scannable instead of a long list.
  // First group is one-tap actions (no page change). The rest are
  // navigation links to feature areas. Help group sits at the bottom
  // for low-frequency shortcuts/about lookups.
  const groups: { title: string; items: MoreMenuItem[] }[] = [
    {
      title: 'Schnell',
      items: [
        { kind: 'action', onClick: shareCurrentView, label: 'Ansicht teilen', desc: 'Aktuellen Link kopieren', icon: <ShareIcon /> },
        { kind: 'action', onClick: toggleFullscreen, label: 'Vollbild', desc: 'Karte ohne Ablenkung', icon: <FullscreenIcon /> },
        { kind: 'action', onClick: reloadApp, label: 'App neu laden', desc: 'Wenn etwas hängt', icon: <RefreshIcon /> },
      ],
    },
    {
      title: 'Verwalten',
      items: [
        { kind: 'link', href: '/alerts', label: 'Preisalarme', desc: 'Benachrichtigungen bei Preissprüngen', icon: <BellIcon /> },
        { kind: 'link', href: '/fuel-log', label: 'Tank-Logbuch', desc: 'Dein Verbrauch im Überblick', icon: <BookIcon /> },
        { kind: 'link', href: '/locations', label: 'Meine Orte', desc: 'Gespeicherte Standorte', icon: <PinIcon /> },
      ],
    },
    {
      title: 'Analysieren',
      items: [
        { kind: 'link', href: '/compare', label: 'Vergleich', desc: 'Stationen direkt nebeneinander', icon: <ScalesIcon /> },
        { kind: 'link', href: '/stats', label: 'Statistiken', desc: 'Preisverläufe analysieren', icon: <ChartIcon /> },
        { kind: 'link', href: '/route-planner', label: 'Routenplaner', desc: 'Tank-Stopp auf der Strecke', icon: <RouteIcon /> },
      ],
    },
    {
      title: 'Mehr',
      items: [
        { kind: 'link', href: '/partners', label: 'Tank- & Ladekarten', desc: 'Unsere Partner', icon: <CardIcon /> },
      ],
    },
    {
      title: 'Hilfe',
      items: [
        { kind: 'action', onClick: () => setShortcutsOpen((v) => !v), label: 'Tastenkürzel', desc: 'Befehle und Shortcuts', icon: <KeyboardIcon /> },
        { kind: 'link', href: '/settings', label: 'Einstellungen & Über', desc: 'Theme, Sprache, Privatsphäre', icon: <CogIcon /> },
      ],
    },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <IconButton onClick={() => setOpen(!open)} label="Mehr">
        <DotsIcon />
      </IconButton>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-80 z-50
                     bg-white dark:bg-gray-900
                     border border-gray-200 dark:border-gray-700/80
                     rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/5
                     p-2 fy-enter"
        >
          {groups.map((group, gi) => (
            <div key={group.title} className={gi > 0 ? 'pt-2 mt-2 border-t border-[var(--color-border-subtle)]' : ''}>
              <div className="px-3 pb-1 text-[10px] font-semibold tracking-wide uppercase text-[var(--color-fg-subtle)]">
                {group.title}
              </div>
              {group.items.map((item, idx) => {
                // Shared row layout — icon on the left, two-line text
                // on the right. Used for both <Link> and <button> so
                // the menu reads as one consistent table.
                const inner = (
                  <>
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg
                                     bg-gray-100 text-[var(--color-fg-subtle)]
                                     dark:bg-gray-800/80">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[var(--color-fg)]">{item.label}</span>
                      <span className="block text-xs text-[var(--color-fg-subtle)] mt-0.5">{item.desc}</span>
                    </span>
                  </>
                );
                const cls =
                  'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-lg)] w-full text-left ' +
                  'hover:bg-gray-100 dark:hover:bg-gray-800/80 ' +
                  'focus:outline-none focus-visible:bg-gray-100 dark:focus-visible:bg-gray-800/80 ' +
                  'transition-colors';

                if (item.kind === 'link') {
                  return (
                    <Link
                      key={`l-${idx}`}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      role="menuitem"
                      className={cls}
                    >
                      {inner}
                    </Link>
                  );
                }
                return (
                  <button
                    key={`a-${idx}`}
                    type="button"
                    onClick={() => {
                      item.onClick();
                      // Keep menu open for the keyboard-shortcuts
                      // toggle so users can flip the popup without
                      // re-opening the menu; close on every other
                      // action so the focus returns to the page.
                      if (item.label !== 'Tastenkürzel') setOpen(false);
                    }}
                    role="menuitem"
                    className={cls}
                  >
                    {inner}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Inline keyboard-shortcuts panel — toggled from the
              "Tastenkürzel" item above. Lightweight cheat-sheet,
              no separate route needed. */}
          {shortcutsOpen && (
            <div className="mt-2 rounded-[var(--radius-lg)] bg-gray-50 dark:bg-gray-800/60 p-3
                            text-xs text-[var(--color-fg-subtle)] space-y-1.5">
              <div className="font-semibold text-[var(--color-fg)] mb-1">Tastenkürzel</div>
              <KbdRow keys={['⌘ / Ctrl', 'K']}   label="Befehlspalette öffnen" />
              <KbdRow keys={['Esc']}              label="Dialoge & Popups schließen" />
              <KbdRow keys={['↑ / ↓']}             label="In Listen navigieren" />
              <KbdRow keys={['Enter']}             label="Auswahl bestätigen" />
              <KbdRow keys={['Rechtsklick / Halten']} label="Pin auf Karte setzen" />
            </div>
          )}

          <div className="px-3 pt-3 pb-2 border-t border-[var(--color-border-subtle)] mt-2">
            <ThemeToggle className="w-full justify-center" />
          </div>
        </div>
      )}
    </div>
  );
}

function KbdRow({ keys, label }: { keys: readonly string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate">{label}</span>
      <span className="flex flex-shrink-0 items-center gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="rounded border border-[var(--color-border)] px-1.5 py-0.5
                       text-[10px] font-mono text-[var(--color-fg)]
                       bg-white dark:bg-gray-900"
          >
            {k}
          </kbd>
        ))}
      </span>
    </div>
  );
}

// ─── Icons (inline, no extra deps) ────────────────────────

const stroke = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function SearchIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path {...stroke} d="m21 21-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
    </svg>
  );
}
function FuelIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        {...stroke}
        d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M15 9h2a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2v0a2 2 0 0 0 2-2v-9.5L19 4"
      />
    </svg>
  );
}
function RadiusIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path {...stroke} d="M12 12 5 5M12 12v3" />
    </svg>
  );
}
function ChevronIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`w-3.5 h-3.5 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path {...stroke} d="m6 9 6 6 6-6" />
    </svg>
  );
}
function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`w-4 h-4 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path {...stroke} d="m5 12 5 5 9-11" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path {...stroke} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path {...stroke} d="M9 6 3 4v14l6 2 6-2 6 2V6l-6-2-6 2ZM9 6v14M15 4v14" />
    </svg>
  );
}
function CarIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path
        {...stroke}
        d="M5 17h14M3 13h18l-2-7H5l-2 7Zm2 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3m6 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3"
      />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path
        {...stroke}
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
      />
    </svg>
  );
}
function CogIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3" />
      <path
        {...stroke}
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
      />
    </svg>
  );
}
function DotsIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

// ─── More-menu item icons ─────────────────────────────────
// All sized 16×16 with stroke 1.8 to match the existing
// header iconography. Kept minimal — anything more decorative
// would compete with the brand-coloured rows below them.

const menuIconCls = 'w-4 h-4';
const menuIconProps = { className: menuIconCls, fill: 'none' as const, viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.8 };

function ShareIcon() {
  return (
    <svg {...menuIconProps}>
      <path {...stroke} d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}
function FullscreenIcon() {
  return (
    <svg {...menuIconProps}>
      <path {...stroke} d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg {...menuIconProps}>
      <path {...stroke} d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg {...menuIconProps}>
      <path {...stroke} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg {...menuIconProps}>
      <path {...stroke} d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V4zM4 4v14a2 2 0 0 0 2 2" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg {...menuIconProps}>
      <circle cx="12" cy="10" r="3" />
      <path {...stroke} d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z" />
    </svg>
  );
}
function ScalesIcon() {
  return (
    <svg {...menuIconProps}>
      <path {...stroke} d="M12 3v18M3 8h18M6 8l-3 6h6l-3-6zM18 8l-3 6h6l-3-6z" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg {...menuIconProps}>
      <path {...stroke} d="M3 3v18h18M7 14l3-3 4 4 5-6" />
    </svg>
  );
}
function RouteIcon() {
  return (
    <svg {...menuIconProps}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path {...stroke} d="M6 8v4a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4" />
    </svg>
  );
}
function CardIcon() {
  return (
    <svg {...menuIconProps}>
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <path {...stroke} d="M2 11h20M6 16h4" />
    </svg>
  );
}
function KeyboardIcon() {
  return (
    <svg {...menuIconProps}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path {...stroke} d="M7 10h0M11 10h0M15 10h0M7 14h10" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="4" />
      <path
        {...stroke}
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path {...stroke} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}
