// @vitest-environment jsdom

// ============================================================
// StoryShell — Spotify-Wrapped-style fullscreen story player.
// Renders nothing with no slides. Otherwise a role=dialog named by
// the title, the active slide node, and labelled share/close/prev/
// next controls. matchMedia is stubbed to prefers-reduced-motion
// so auto-advance (RAF) stays off and the test is deterministic;
// next/navigation + translations mocked.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn() }) }));

import { StoryShell } from '../wrapped/StoryShell';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

const slides = [
  { id: 's1', node: <div>Slide A</div> },
  { id: 's2', node: <div>Slide B</div> },
];

describe('StoryShell', () => {
  beforeEach(() => {
    stubMatchMedia(true); // prefers-reduced-motion → no auto-advance
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders nothing without slides', () => {
    const { container } = render(<StoryShell slides={[]} title="Wrapped" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the active slide inside a labelled dialog with controls', () => {
    render(<StoryShell slides={slides} title="Wrapped" />);
    expect(screen.getByRole('dialog', { name: 'Wrapped' })).toBeInTheDocument();
    expect(screen.getByText('Slide A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'wrapped.shareLabel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'wrapped.closeLabel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'wrapped.nextSlide' })).toBeInTheDocument();
  });

  it('advances to the next slide on tap', () => {
    render(<StoryShell slides={slides} title="Wrapped" />);
    fireEvent.click(screen.getByRole('button', { name: 'wrapped.nextSlide' }));
    expect(screen.getByText('Slide B')).toBeInTheDocument();
    expect(screen.queryByText('Slide A')).toBeNull();
  });

  it('calls onClose when the close control is pressed', () => {
    const onClose = vi.fn();
    render(<StoryShell slides={slides} title="Wrapped" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'wrapped.closeLabel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
