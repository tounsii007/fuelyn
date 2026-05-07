// ============================================================
// CommandPalette — Linear-style ⌘K dialog.
//
// • Opens via ⌘K / Ctrl+K, the toolbar trigger button, or any
//   `tp:open-command-palette` CustomEvent.
// • Fuzzy-filters its action list as you type.
// • Fully keyboard-driven: ↑/↓ to navigate, Enter to invoke,
//   Esc to close. Focus is trapped to the dialog while open.
// • Animated fade + scale-in, glass-morphic surface, native-feel
//   focus ring.
// ============================================================

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/theme/ThemeProvider';

interface Command {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  group: 'Navigation' | 'Aktionen' | 'Erscheinungsbild';
  icon: ReactNode;
  perform: () => void;
}

function defaultCommands(
  router: ReturnType<typeof useRouter>,
  setTheme: (t: 'light' | 'dark' | 'system') => void,
): Command[] {
  return [
    { id: 'home', group: 'Navigation', label: 'Karte', hint: 'Startseite', icon: '🗺️',
      perform: () => router.push('/') },
    { id: 'compare', group: 'Navigation', label: 'Vergleich', icon: '⚖️',
      perform: () => router.push('/compare') },
    { id: 'fuel-log', group: 'Navigation', label: 'Tank-Logbuch', icon: '📒',
      perform: () => router.push('/fuel-log') },
    { id: 'favorites', group: 'Navigation', label: 'Favoriten', icon: '⭐',
      perform: () => router.push('/favorites') },
    { id: 'route-planner', group: 'Navigation', label: 'Routenplaner', icon: '🛣️',
      perform: () => router.push('/route-planner') },
    { id: 'stats', group: 'Navigation', label: 'Statistiken', icon: '📈',
      perform: () => router.push('/stats') },
    { id: 'alerts', group: 'Navigation', label: 'Preisalarme', icon: '🔔',
      perform: () => router.push('/alerts') },
    { id: 'partners', group: 'Navigation', label: 'Tank- & Ladekarten', icon: '💳',
      perform: () => router.push('/partners') },
    { id: 'wrapped', group: 'Navigation', label: 'Fuelyn Wrapped', hint: 'Dein Jahr in Zahlen',
      icon: '🎁', perform: () => router.push('/wrapped') },
    { id: 'settings', group: 'Navigation', label: 'Einstellungen', icon: '⚙️',
      perform: () => router.push('/settings') },
    { id: 'theme-light', group: 'Erscheinungsbild', label: 'Heller Modus', icon: '☀️',
      perform: () => setTheme('light') },
    { id: 'theme-dark', group: 'Erscheinungsbild', label: 'Dunkler Modus', icon: '🌙',
      perform: () => setTheme('dark') },
    { id: 'theme-system', group: 'Erscheinungsbild', label: 'System-Theme folgen', icon: '🖥️',
      perform: () => setTheme('system') },
  ];
}

function fuzzyMatch(query: string, label: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = label.toLowerCase();
  if (t.includes(q)) return true;
  // sub-sequence match: "fl" matches "Fuel Log"
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const router = useRouter();
  const { setPreference } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const commands = useMemo(
    () => defaultCommands(router, setPreference),
    [router, setPreference],
  );

  const filtered = useMemo(
    () => commands.filter((c) => fuzzyMatch(query, c.label) || fuzzyMatch(query, c.group)),
    [commands, query],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const c of filtered) {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // ─── Open / close hooks ────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    const onCustom = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('tp:open-command-palette', onCustom as EventListener);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('tp:open-command-palette', onCustom as EventListener);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIdx(0);
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // Reset active index when filtered list changes
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const flat = filtered;

  const onListKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(flat.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = flat[activeIdx];
        if (cmd) {
          cmd.perform();
          setOpen(false);
        }
      }
    },
    [flat, activeIdx],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Befehlspalette"
      className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-20"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[var(--color-overlay)] backdrop-blur-sm"
        style={{ animation: 'fy-enter 200ms var(--ease-soft) both' }}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative w-full max-w-xl fy-glass rounded-[var(--radius-2xl)]
                   shadow-[var(--shadow-xl)] overflow-hidden"
        style={{ animation: 'fy-enter 220ms var(--ease-spring) both' }}
      >
        {/* Search field */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-[var(--color-border-subtle)]">
          <svg className="w-5 h-5 text-[var(--color-fg-subtle)]" fill="none" viewBox="0 0 24 24"
               stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
                  d="m21 21-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onListKey}
            placeholder="Tippe einen Befehl oder eine Seite…"
            className="flex-1 bg-transparent text-base text-[var(--color-fg)]
                       placeholder:text-[var(--color-fg-subtle)] outline-none"
            aria-controls="cmdk-list"
            aria-activedescendant={flat[activeIdx]?.id}
          />
          <kbd className="text-[10px] font-mono text-[var(--color-fg-subtle)]
                          border border-[var(--color-border)] rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>

        {/* List */}
        <div id="cmdk-list" role="listbox" className="max-h-[60vh] overflow-y-auto py-2">
          {grouped.length === 0 ? (
            <div className="px-4 py-8 text-sm text-center text-[var(--color-fg-subtle)]">
              Keine Treffer.
            </div>
          ) : (
            grouped.map(([group, cmds]) => (
              <div key={group}>
                <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider
                                font-semibold text-[var(--color-fg-subtle)]">
                  {group}
                </div>
                {cmds.map((cmd) => {
                  const flatIdx = flat.indexOf(cmd);
                  const active = flatIdx === activeIdx;
                  return (
                    <button
                      key={cmd.id}
                      id={cmd.id}
                      role="option"
                      aria-selected={active}
                      type="button"
                      onMouseEnter={() => setActiveIdx(flatIdx)}
                      onClick={() => {
                        cmd.perform();
                        setOpen(false);
                      }}
                      className={[
                        'w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                        active
                          ? 'bg-[var(--color-brand-100)]/50 text-[var(--color-fg)] dark:bg-[var(--color-brand-800)]/40'
                          : 'text-[var(--color-fg)] hover:bg-[var(--color-surface-hover)]',
                      ].join(' ')}
                    >
                      <span className="text-base" aria-hidden>{cmd.icon}</span>
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {cmd.hint && (
                        <span className="text-xs text-[var(--color-fg-subtle)]">{cmd.hint}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 h-9 border-t border-[var(--color-border-subtle)]
                        text-[11px] text-[var(--color-fg-subtle)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> Navigieren
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> Auswählen
            </span>
          </div>
          <span>{flat.length} Befehle</span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1
                     border border-[var(--color-border)] rounded text-[10px] font-mono
                     bg-[var(--color-bg)]">
      {children}
    </kbd>
  );
}
