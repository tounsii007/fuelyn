// ============================================================
// /achievements — standalone Achievements page.
// Phase 9. Linked from MoreMenu and the Wrapped page.
// ============================================================

'use client';

import Link from 'next/link';
import { AchievementsPanel } from '@/components/achievements/AchievementsPanel';

export default function AchievementsPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 animate-fade-in">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400
                   hover:text-gray-700 dark:hover:text-gray-200 mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Zurück
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Deine Erfolge</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Sammle Badges fürs regelmäßige Sparen, Mit­tippen bei Preis-Korrekturen und das Erkunden
          neuer Stationen.
        </p>
      </header>

      <AchievementsPanel />
    </div>
  );
}
