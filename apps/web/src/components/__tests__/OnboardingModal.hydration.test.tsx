// @vitest-environment jsdom

// ============================================================
// OnboardingModal — SSR mount-gate test.
//
// Pins the iter-C mount-gate fix: the modal MUST NOT render on
// the server because it depends on Zustand-persist'ed state
// (onboardingDone) that the server can't see. Without the gate,
// returning users would get the modal in SSR HTML and watch it
// disappear on hydration → React #418 mismatch.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { OnboardingModal } from '../onboarding/OnboardingModal';
import { useAppStore } from '@/lib/store/app-store';

describe('OnboardingModal — SSR mount-gate', () => {
  afterEach(() => cleanup());

  it('renders nothing on the server even when onboardingDone defaults to false', () => {
    // SSR can't reach Zustand-persist, so the store reports the
    // default `onboardingDone=false`. Without the mount-gate, the
    // server WOULD render the full modal at this point. With the
    // gate, the server emits nothing and the client takes over.
    useAppStore.setState({ onboardingDone: false });

    const html = renderToString(<OnboardingModal />);

    expect(html).toBe('');
  });

  it('renders nothing on the server when onboardingDone is true either', () => {
    // The other branch of the modal: even when state says "done",
    // SSR still emits nothing — so the gate is symmetric.
    useAppStore.setState({ onboardingDone: true });

    const html = renderToString(<OnboardingModal />);

    expect(html).toBe('');
  });

  it('renders the modal on the client after mount when onboardingDone is false', () => {
    useAppStore.setState({ onboardingDone: false });
    const { container } = render(<OnboardingModal />);

    // RTL flushes effects, so the post-mount render is what we see
    expect(container.querySelector('h2')?.textContent).toMatch(
      /Willkommen bei Fuelyn/,
    );
  });

  it('renders nothing on the client when onboardingDone is true', () => {
    useAppStore.setState({ onboardingDone: true });
    const { container } = render(<OnboardingModal />);

    expect(container.firstChild).toBeNull();
  });
});
