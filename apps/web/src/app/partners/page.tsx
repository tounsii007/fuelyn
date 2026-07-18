// ============================================================
// Partners Page — Tankkarten & Ladekarten Affiliate
// ============================================================

'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AFFILIATE_PARTNERS } from '@/lib/affiliate-partners';
import type { AffiliatePartner } from '@fuelyn/core';
import { useTranslations } from '@/lib/hooks/use-translations';
import { PARTNER_TEXT } from '@/lib/partner-text';

type TabId = 'all' | 'tankkarte' | 'ladekarte' | 'club';

const TABS: { id: TabId; labelKey: string; icon: string }[] = [
  { id: 'all', labelKey: 'partners.tabAll', icon: '🏷️' },
  { id: 'tankkarte', labelKey: 'partners.tabTankkarte', icon: '⛽' },
  { id: 'ladekarte', labelKey: 'partners.tabLadekarte', icon: '🔌' },
  { id: 'club', labelKey: 'partners.tabClub', icon: '🏅' },
];

const CATEGORY_COLORS: Record<string, string> = {
  tankkarte: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  ladekarte: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  versicherung: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  club: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  tankkarte: 'partners.catTankkarte',
  ladekarte: 'partners.catLadekarte',
  versicherung: 'partners.catVersicherung',
  club: 'partners.catClub',
};

function PartnerCard({ partner }: { partner: AffiliatePartner }) {
  const { t, locale } = useTranslations();
  const [expanded, setExpanded] = useState(false);

  // Localized marketing copy, falling back to German if a locale is
  // missing a partner (keeps rendering resilient to data drift).
  const text = PARTNER_TEXT[locale]?.[partner.id] ?? PARTNER_TEXT.de[partner.id];
  if (!text) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700
                    shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Logo placeholder */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600
                          flex items-center justify-center flex-shrink-0 text-lg font-bold text-gray-500 dark:text-gray-300">
              {partner.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate">{partner.name}</h3>
              <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5 ${CATEGORY_COLORS[partner.category] || ''}`}>
                {CATEGORY_LABEL_KEYS[partner.category] ? t(CATEGORY_LABEL_KEYS[partner.category]!) : partner.category}
              </span>
            </div>
          </div>
          {text.discount && (
            <div className="flex-shrink-0 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800
                          text-green-700 dark:text-green-400 text-[11px] font-bold px-2 py-1 rounded-lg text-center leading-tight">
              {text.discount}
            </div>
          )}
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
          {text.description}
        </p>
      </div>

      {/* Benefits (expandable) */}
      {expanded && (
        <div className="px-4 pb-3 border-t border-gray-50 dark:border-gray-700/50 pt-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            {t('partners.benefitsHeading')}
          </p>
          <ul className="space-y-1.5">
            {text.benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <svg className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 pb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-brand-600 transition-colors"
        >
          {expanded ? t('partners.hideBenefits') : t('partners.showBenefits')}
        </button>
        <div className="flex-1" />
        <a
          href={partner.affiliateUrl}
          target="_blank"
          // Affiliate links must be tagged sponsored+nofollow (Google
          // link-spam policy) so referral params don't pass PageRank.
          rel="sponsored nofollow noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-brand-500 to-brand-700
                     text-white text-sm font-semibold rounded-xl shadow-md shadow-brand-500/20
                     hover:shadow-lg hover:shadow-brand-500/30 hover:scale-[1.02] active:scale-[0.98]
                     transition-all"
          onClick={() => {
            // Track affiliate click (analytics placeholder)
            if (typeof window !== 'undefined' && 'gtag' in window) {
              (window as unknown as Record<string, ((...args: unknown[]) => void) | undefined>).gtag?.('event', 'affiliate_click', {
                partner_id: partner.id,
                partner_name: partner.name,
                category: partner.category,
              });
            }
          }}
        >
          {t('partners.learnMore')}
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
      </div>
    </div>
  );
}

export default function PartnersPage() {
  const { t } = useTranslations();
  const [activeTab, setActiveTab] = useState<TabId>('all');

  const filteredPartners = activeTab === 'all'
    ? AFFILIATE_PARTNERS
    : AFFILIATE_PARTNERS.filter((p) => p.category === activeTab);

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
        {/* Hero */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400
                        text-xs font-semibold px-3 py-1 rounded-full mb-3">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            {t('partners.eyebrow')}
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100">
            {t('partners.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('partners.subtitle')}
          </p>
          {/* Prominent affiliate disclosure (UWG §5a / Kennzeichnungspflicht):
              the ad relationship must be labelled clearly, not just in the
              fine print at the bottom. */}
          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium
                        text-gray-500 dark:text-gray-400
                        bg-gray-100 dark:bg-gray-800 rounded-full px-2.5 py-1">
            <span className="font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">{t('partners.disclosureTag')}</span>
            {t('partners.disclosureText')}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100/80 dark:bg-gray-800/80 rounded-xl p-1 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all
                ${activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
            >
              <span>{tab.icon}</span>
              <span>{t(tab.labelKey)}</span>
            </button>
          ))}
        </div>

        {/* Partner Cards */}
        <div className="space-y-4">
          {filteredPartners.map((partner) => (
            <PartnerCard key={partner.id} partner={partner} />
          ))}
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-8 px-4 leading-relaxed">
          {t('partners.disclaimer')}
        </p>
      </div>
    </AppShell>
  );
}
