// @vitest-environment jsdom

// ============================================================
// PageHeader — back-link + title + optional subtitle/action.
//
// next/link is mocked to a plain anchor so the unit test doesn't
// need an AppRouter context.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { type ReactNode, type AnchorHTMLAttributes } from 'react';
import { PageHeader } from '../ui/PageHeader';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => cleanup());

describe('PageHeader', () => {
  it('renders the title as an h1', () => {
    render(<PageHeader title="Einstellungen" />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Einstellungen');
  });

  it('renders a default "Zurück" back-link pointing home', () => {
    render(<PageHeader title="t" />);
    const link = screen.getByRole('link', { name: /Zurück/ });
    expect(link).toHaveAttribute('href', '/');
  });

  it('honours custom backHref and backLabel', () => {
    render(<PageHeader title="t" backHref="/settings" backLabel="Go back" />);
    const link = screen.getByRole('link', { name: /Go back/ });
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('renders a subtitle only when provided', () => {
    const { rerender } = render(<PageHeader title="t" />);
    expect(screen.queryByText('My subtitle')).toBeNull();
    rerender(<PageHeader title="t" subtitle="My subtitle" />);
    expect(screen.getByText('My subtitle')).toBeInTheDocument();
  });

  it('renders an action node when provided', () => {
    render(<PageHeader title="t" action={<button>Save</button>} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('forwards a custom className to the header', () => {
    const { container } = render(<PageHeader title="t" className="custom-cls" />);
    expect(container.querySelector('header')?.className).toMatch(/custom-cls/);
  });
});
