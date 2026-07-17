// ============================================================
// Skip-to-content link (Iteration 4 — accessibility / WCAG 2.4.1).
//
// First focusable element on every page. Visually hidden until it
// receives keyboard focus, then it slides into view so keyboard and
// screen-reader users can jump straight past the header/nav to the
// main content. Targets `#main-content` (set on the <main> landmark).
// ============================================================

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[2000]
                 focus:inline-flex focus:items-center focus:rounded-[var(--radius-pill)]
                 focus:bg-[var(--color-brand-600)] focus:px-4 focus:py-2
                 focus:text-sm focus:font-semibold focus:text-white
                 focus:shadow-[var(--shadow-glow-brand)]
                 focus:outline-none focus:ring-2 focus:ring-white/70"
    >
      Zum Inhalt springen
    </a>
  );
}
