// ============================================================
// MembershipPicker — toggleable list of brand loyalty cards.
//
// Shown in /settings under a new "Tankkarten" section. Each
// active card triggers the StationCard / BestDealCard to show
// the EFFECTIVE price (sticker minus discount) when the
// station's brand matches.
// ============================================================

'use client';

import Link from 'next/link';
import { MEMBERSHIPS, type MembershipDiscount } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';

export function MembershipPicker() {
  const { t } = useTranslations();
  const hydrated = useIsHydrated();
  const active = useAppStore((s) => s.activeMemberships);
  const toggle = useAppStore((s) => s.toggleMembership);

  if (!hydrated) return null;

  return (
    <section
      id="sec-memberships"
      aria-label={t('memberships.title')}
      className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5 scroll-mt-24"
    >
      <header className="mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {t('memberships.title')}
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t('memberships.subtitle')}
        </p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {MEMBERSHIPS.map((m) => (
          <Card
            key={m.id}
            membership={m}
            checked={active.includes(m.id)}
            onToggle={() => toggle(m.id)}
            t={t}
          />
        ))}
      </ul>

      {/* Bridge from the effective-price loyalty context to the affiliate
          channel: users without a card can discover partner offers. */}
      <Link
        href="/partners"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-300
                   hover:text-brand-700 dark:hover:text-brand-200
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-md"
      >
        {t('memberships.discoverCta')}
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

function Card({
  membership,
  checked,
  onToggle,
  t,
}: {
  membership: MembershipDiscount;
  checked: boolean;
  onToggle: () => void;
  t: (k: string) => string;
}) {
  // Per-fuel discount range — single number when uniform, range otherwise.
  const discounts = Object.values(membership.perFuel).filter((v): v is number => v != null && v > 0);
  const min = Math.min(...discounts);
  const max = Math.max(...discounts);
  const range = min === max ? `${(min * 100).toFixed(0)}` : `${(min * 100).toFixed(0)}–${(max * 100).toFixed(0)}`;

  return (
    <li>
      <label
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all
                    ${checked
                      ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20'
                      : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
                    }`}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={onToggle}
          aria-label={t(`memberships.cards.${membership.id}.label`)}
        />
        <span
          className={`w-4 h-4 rounded-md border-2 flex items-center justify-center flex-shrink-0
                      ${checked ? 'border-brand-600 bg-brand-600' : 'border-gray-300 dark:border-gray-600'}`}
          aria-hidden="true"
        >
          {checked && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t(`memberships.cards.${membership.id}.label`)}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {membership.brand} · {range} ct/L
          </p>
        </div>
      </label>
    </li>
  );
}
