// ============================================================
// AppShell — modern, glass-morphic, sticky shell with hover-grow
// nav buttons, command-palette trigger, and segmented quick-controls.
// ============================================================

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { FUEL_TYPE_LABELS, RADIUS_OPTIONS_KM } from '@tankpilot/core';
import type { FuelType } from '@tankpilot/core';
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
        className="pointer-events-none fixed inset-0 -z-10 tp-mesh tp-mesh-animated"
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

      {/* Header — sticky, glass-morphic, shrinks subtly on scroll */}
      <header
        className={[
          'sticky top-0 z-30 transition-all duration-200',
          scrolled
            ? 'tp-glass shadow-[var(--shadow-sm)] border-b border-[var(--color-border-subtle)]'
            : 'bg-transparent border-b border-transparent',
        ].join(' ')}
      >
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Brand />

          <div className="flex items-center gap-1.5">
            <CommandTrigger />
            <SegmentedSelect
              icon={<FuelIcon />}
              value={fuelType}
              onChange={(v) => setFuelType(v as FuelType)}
              options={Object.entries(FUEL_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              ariaLabel="Kraftstoffart"
            />
            <SegmentedSelect
              icon={<RadiusIcon />}
              value={String(radiusKm)}
              onChange={(v) => setFilter({ radiusKm: Number(v) })}
              options={RADIUS_OPTIONS_KM.map((r) => ({ value: String(r), label: `${r} km` }))}
              ariaLabel="Suchradius"
            />

            <Divider />

            <IconButton onClick={toggleView} label={isMapView ? 'Listenansicht' : 'Kartenansicht'}>
              {isMapView ? <ListIcon /> : <MapIcon />}
            </IconButton>

            <IconLink href="/vehicle" label="Fahrzeug">
              <CarIcon />
            </IconLink>
            <IconLink href="/favorites" label="Favoriten">
              <HeartIcon />
            </IconLink>

            <NotificationBell />

            <ThemeQuickToggle />

            <IconLink href="/settings" label="Einstellungen">
              <CogIcon />
            </IconLink>

            <MoreMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

// ─── Brand ─────────────────────────────────────────────────

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group" aria-label="TankPilot Startseite">
      <span
        aria-hidden="true"
        className="relative w-9 h-9 rounded-2xl tp-ring-glow flex items-center justify-center
                   bg-gradient-to-br from-[var(--color-brand-500)] via-[var(--color-brand-600)] to-[var(--color-brand-800)]
                   text-white tp-press transition-transform group-hover:scale-105"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
        <span className="absolute inset-0 rounded-2xl bg-white/30 mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-bold tracking-tight tp-text-gradient">TankPilot</span>
        <span className="text-[10px] font-medium text-[var(--color-fg-subtle)] mt-0.5">
          Günstig &amp; smart tanken
        </span>
      </span>
    </Link>
  );
}

// ─── Command palette trigger (⌘K placeholder; opens search later) ─

function CommandTrigger() {
  return (
    <button
      type="button"
      onClick={() => {
        // hook: dispatch a global custom event so any future <CommandPalette/>
        // component can listen and open without coupling.
        window.dispatchEvent(new CustomEvent('tp:open-command-palette'));
      }}
      aria-label="Schnellsuche öffnen"
      className="hidden md:inline-flex items-center gap-2 h-8 px-3 rounded-[var(--radius-pill)]
                 tp-glass-subtle text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]
                 border border-[var(--color-border)] tp-press"
    >
      <SearchIcon />
      <span>Suchen</span>
      <kbd className="ml-1 hidden lg:inline-block text-[10px] font-mono text-[var(--color-fg-subtle)]
                       border border-[var(--color-border)] rounded px-1.5 py-0.5 leading-none">
        ⌘K
      </kbd>
    </button>
  );
}

// ─── Reusable elements ────────────────────────────────────

interface SegmentedSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  icon: React.ReactNode;
  ariaLabel: string;
}

function SegmentedSelect({ value, onChange, options, icon, ariaLabel }: SegmentedSelectProps) {
  return (
    <label className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--radius-pill)]
                      tp-glass-subtle border border-[var(--color-border)]
                      transition-[border-color,box-shadow] focus-within:border-[var(--color-brand-500)]
                      focus-within:shadow-[var(--shadow-glow-brand)]">
      <span className="text-[var(--color-brand-600)]">{icon}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="text-xs font-semibold bg-transparent text-[var(--color-fg)]
                   focus:outline-none cursor-pointer pr-2 appearance-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

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
      className="w-9 h-9 rounded-2xl flex items-center justify-center text-[var(--color-fg-subtle)]
                 hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-hover)] tp-press"
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
      className="w-9 h-9 rounded-2xl flex items-center justify-center text-[var(--color-fg-subtle)]
                 hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-hover)] tp-press"
    >
      {children}
    </Link>
  );
}

function Divider() {
  return <span aria-hidden="true" className="w-px h-6 bg-[var(--color-border)] mx-1" />;
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

function MoreMenu() {
  const [open, setOpen] = useState(false);
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

  const links = [
    { href: '/alerts', label: 'Preisalarme', desc: 'Benachrichtigungen bei Preissprüngen' },
    { href: '/fuel-log', label: 'Tank-Logbuch', desc: 'Dein Verbrauch im Überblick' },
    { href: '/locations', label: 'Meine Orte', desc: 'Gespeicherte Standorte' },
    { href: '/compare', label: 'Vergleich', desc: 'Stationen direkt nebeneinander' },
    { href: '/stats', label: 'Statistiken', desc: 'Preisverläufe analysieren' },
    { href: '/route-planner', label: 'Routenplaner', desc: 'Tank-Stopp auf der Strecke' },
    { href: '/partners', label: 'Tank- & Ladekarten', desc: 'Unsere Partner' },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <IconButton onClick={() => setOpen(!open)} label="Mehr">
        <DotsIcon />
      </IconButton>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 tp-glass rounded-2xl shadow-[var(--shadow-xl)]
                     p-2 z-50 tp-enter"
        >
          {links.map((link, idx) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              role="menuitem"
              className="block px-3 py-2.5 rounded-[var(--radius-lg)] hover:bg-[var(--color-surface-hover)]
                         transition-colors group"
              style={{
                animation: `tp-enter 250ms var(--ease-spring) ${staggerDelayMs(idx)}ms both`,
              }}
            >
              <div className="text-sm font-medium text-[var(--color-fg)]">{link.label}</div>
              <div className="text-xs text-[var(--color-fg-subtle)] mt-0.5">{link.desc}</div>
            </Link>
          ))}
          <div className="px-3 pt-3 pb-2 border-t border-[var(--color-border-subtle)] mt-2">
            <ThemeToggle className="w-full justify-center" />
          </div>
        </div>
      )}
    </div>
  );
}

// Stagger menu items in by ~25ms each.
function staggerDelayMs(i: number) {
  return i * 25;
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
      <path {...stroke} d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M15 9h2a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2v0a2 2 0 0 0 2-2v-9.5L19 4" />
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
      <path {...stroke} d="M5 17h14M3 13h18l-2-7H5l-2 7Zm2 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3m6 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path {...stroke} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
    </svg>
  );
}
function CogIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3" />
      <path {...stroke} d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
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
function SunIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="4" />
      <path {...stroke} d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
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
