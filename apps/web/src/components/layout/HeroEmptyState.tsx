// ============================================================
// HeroEmptyState — modern, full-bleed welcome screen shown when
// the user hasn't granted geolocation yet. Big typography,
// gradient mesh, animated chips, and clear CTAs.
// ============================================================

'use client';

import { Button } from '@/components/ui/Button';

interface HeroEmptyStateProps {
  onRequestLocation: () => void;
  onUseDemoLocation: () => void;
}

const HIGHLIGHTS = [
  { icon: '⚡', label: 'Live-Preise', tone: 'brand' as const },
  { icon: '🎯', label: 'Smart-Empfehlung', tone: 'accent' as const },
  { icon: '📈', label: 'Preis-Trends', tone: 'info' as const },
  { icon: '🔋', label: 'EV + Wasserstoff', tone: 'warning' as const },
];

const TONE_CLASS = {
  brand: 'bg-[var(--color-brand-100)]/70 text-[var(--color-brand-700)] dark:bg-[var(--color-brand-900)]/40 dark:text-[var(--color-brand-100)]',
  accent: 'bg-[var(--color-accent-100)]/70 text-[var(--color-accent-700)] dark:bg-[oklch(0.30_0.10_145)]/60 dark:text-[var(--color-accent-100)]',
  info: 'bg-[oklch(0.95_0.05_230)] text-[oklch(0.40_0.15_230)] dark:bg-[oklch(0.30_0.12_230)] dark:text-[oklch(0.85_0.08_230)]',
  warning: 'bg-[oklch(0.95_0.07_75)] text-[oklch(0.40_0.15_75)] dark:bg-[oklch(0.30_0.12_75)] dark:text-[oklch(0.85_0.08_75)]',
};

export function HeroEmptyState({
  onRequestLocation,
  onUseDemoLocation,
}: HeroEmptyStateProps) {
  return (
    <section className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Layered mesh + decorative orbs */}
      <div aria-hidden className="absolute inset-0 fy-mesh fy-mesh-animated" />
      <div
        aria-hidden
        className="absolute top-12 right-12 w-72 h-72 rounded-full opacity-50 blur-3xl
                   bg-[var(--color-brand-300)] dark:bg-[var(--color-brand-700)] fy-float"
      />
      <div
        aria-hidden
        className="absolute bottom-8 left-8 w-64 h-64 rounded-full opacity-40 blur-3xl
                   bg-[var(--color-accent-300)] dark:bg-[var(--color-accent-700)] fy-float"
        style={{ animationDelay: '2s' }}
      />

      <div className="relative max-w-2xl mx-auto px-6 text-center fy-enter">
        {/* Pin icon with glow */}
        <div
          aria-hidden
          className="mx-auto mb-8 w-20 h-20 rounded-3xl fy-ring-glow flex items-center justify-center
                     bg-gradient-to-br from-[var(--color-brand-500)] via-[var(--color-brand-600)] to-[var(--color-brand-800)]
                     text-white fy-float"
        >
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.05]">
          <span className="fy-text-gradient">Tanken,</span> wenn es{' '}
          <br className="hidden md:block" />
          wirklich günstig ist.
        </h1>

        <p className="mt-5 text-base md:text-lg text-[var(--color-fg-muted)] max-w-md mx-auto leading-relaxed">
          Erlaube den Standortzugriff für Live-Preise in deiner Nähe — oder schaue
          dich erstmal in Berlin um.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button size="lg" onClick={onRequestLocation} leadingIcon={<LocationIcon />}>
            Standort freigeben
          </Button>
          <Button size="lg" variant="ghost" onClick={onUseDemoLocation}>
            Demo öffnen (Berlin)
          </Button>
        </div>

        {/* Highlight chips */}
        <ul className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {HIGHLIGHTS.map((h, i) => (
            <li
              key={h.label}
              className={[
                'inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-pill)]',
                'text-xs font-medium fy-glass-subtle border border-[var(--color-border-subtle)]',
                TONE_CLASS[h.tone],
              ].join(' ')}
              style={{ animation: `fy-enter 350ms var(--ease-spring) ${i * 60 + 120}ms both` }}
            >
              <span aria-hidden>{h.icon}</span>
              {h.label}
            </li>
          ))}
        </ul>

        {/*
          Feature mini-grid — three short explanations that
          translate "AI fuel intelligence" into something concrete.
          Sits above the privacy note so the value pitch is the
          last thing users read before scrolling, with the privacy
          assurance acting as the trust closer.
        */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto text-left">
          <FeatureTile
            icon="🎯"
            title="Smart-Empfehlung"
            body="Nicht nur die billigste — die sinnvollste Tankstelle für deine Strecke."
          />
          <FeatureTile
            icon="📈"
            title="Markt-Kontext"
            body="±ct vs. Schnitt für jede Tankstelle. Wissen, was günstig wirklich heißt."
          />
          <FeatureTile
            icon="⏰"
            title="Beste Zeit"
            body="Wann es typischerweise billiger wird — pro Wochentag und Uhrzeit."
          />
        </div>

        {/* Privacy note */}
        <p className="mt-8 text-xs text-[var(--color-fg-subtle)]">
          🔒 Dein Standort verlässt nie dein Gerät. Wir senden nur Koordinaten an unseren Server,
          niemals Identifier.
        </p>
      </div>
    </section>
  );
}

function FeatureTile({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div
      className="rounded-2xl border border-[var(--color-border-subtle)]
                 bg-[var(--color-surface)]/60 backdrop-blur-sm p-3.5
                 hover:bg-[var(--color-surface)]/85 transition-colors"
    >
      <div className="flex items-start gap-2.5">
        <span className="text-xl select-none flex-shrink-0" aria-hidden>{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-fg)]">{title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}

function LocationIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}
