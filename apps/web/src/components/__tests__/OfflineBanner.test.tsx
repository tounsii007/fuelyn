// @vitest-environment jsdom

// ============================================================
// OfflineBanner — connectivity banner driven by useOnlineStatus.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const onlineMock = vi.hoisted(() => ({ isOnline: true, wasOffline: false }));
vi.mock('@/lib/hooks/use-online-status', () => ({
  useOnlineStatus: () => ({ isOnline: onlineMock.isOnline, wasOffline: onlineMock.wasOffline }),
}));
vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { OfflineBanner } from '../layout/OfflineBanner';

describe('OfflineBanner', () => {
  beforeEach(() => {
    onlineMock.isOnline = true;
    onlineMock.wasOffline = false;
  });
  afterEach(() => cleanup());

  it('renders nothing while online and never recently offline', () => {
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the offline message + neutral styling when offline', () => {
    onlineMock.isOnline = false;
    render(<OfflineBanner />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('offline.banner');
    expect(banner.className).toMatch(/bg-gray-700/);
  });

  it('shows the back-online message + success styling after reconnecting', () => {
    onlineMock.isOnline = true;
    onlineMock.wasOffline = true;
    render(<OfflineBanner />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('offline.backOnline');
    expect(banner.className).toMatch(/bg-green-600/);
  });
});
