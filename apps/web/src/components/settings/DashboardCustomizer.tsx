// ============================================================
// DashboardCustomizer — drag-free reorder + visibility toggles
// for the homepage sidebar cards.
//
// Lives in /settings. The user sees every card in current order,
// can move it up/down with arrows, hide/show with a switch, or
// reset to defaults. Changes flow through the existing Zustand
// store and persist via the cloud-sync layer.
// ============================================================

'use client';

import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';

// Karten die per Default sichtbar sind = polierte Hero-Surface.
// "Experimental"-Karten sind per Default aus; im Customizer mit
// Hinweis-Badge gekennzeichnet, damit klar ist warum sie nicht
// schon auf der Startseite erscheinen.
const CARD_LABELS: Record<string, string> = {
  'best-deal':        'Top Deal',
  'price-prediction': 'Preis-Prognose',
  'border-crossing':  'Grenz-Tipp',
  'smart-buying':     'Smart-Buying-Score',
  'saving-tips':      'Spar-Tipps',
  'counterfactual':   'Was wäre wenn …',
};

const EXPERIMENTAL_CARDS = new Set([
  'border-crossing',
  'smart-buying',
  'saving-tips',
  'counterfactual',
]);

export function DashboardCustomizer() {
  const { t } = useTranslations();
  const cards = useAppStore((s) => s.dashboardCards);
  const toggle = useAppStore((s) => s.toggleDashboardCard);
  const move = useAppStore((s) => s.moveDashboardCard);
  const reset = useAppStore((s) => s.resetDashboardCards);

  return (
    <section
      aria-label={t('dashboardCustomizer.title')}
      className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-3 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {t('dashboardCustomizer.title')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('dashboardCustomizer.desc')}
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline-offset-2 hover:underline"
        >
          {t('dashboardCustomizer.reset')}
        </button>
      </div>

      <ul className="space-y-1.5">
        {cards.map((card, idx) => (
          <li
            key={card.id}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg
                       bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => move(card.id, -1)}
                disabled={idx === 0}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                aria-label={t('dashboardCustomizer.moveUp')}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
              </button>
              <button
                type="button"
                onClick={() => move(card.id, 1)}
                disabled={idx === cards.length - 1}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                aria-label={t('dashboardCustomizer.moveDown')}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                {CARD_LABELS[card.id] ?? card.id}
              </span>
              {EXPERIMENTAL_CARDS.has(card.id) && (
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide
                             px-1.5 py-0.5 rounded
                             bg-[var(--color-violet-500)]/15
                             text-[var(--color-violet-500)]"
                >
                  Beta
                </span>
              )}
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={card.visible}
                onChange={() => toggle(card.id)}
                className="sr-only peer"
              />
              <span
                className="relative inline-flex h-5 w-9 items-center rounded-full
                           bg-gray-300 peer-checked:bg-[var(--color-brand-500)]
                           transition-colors"
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform
                             ${card.visible ? 'translate-x-4' : 'translate-x-0.5'}`}
                />
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
