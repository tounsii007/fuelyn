// @vitest-environment jsdom

// ============================================================
// Tooltip — pure-CSS focus/hover bubble with role="tooltip".
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Tooltip } from '../ui/Tooltip';

afterEach(() => cleanup());

describe('Tooltip', () => {
  it('renders the trigger children', () => {
    render(
      <Tooltip label="Help">
        <button>Trigger</button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'Trigger' })).toBeInTheDocument();
  });

  it('renders the label inside a role="tooltip" element', () => {
    render(
      <Tooltip label="Explains the thing">
        <span>x</span>
      </Tooltip>,
    );
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Explains the thing');
  });

  it('places the bubble above the trigger by default (side="top")', () => {
    render(
      <Tooltip label="t">
        <span>x</span>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip').className).toContain('bottom-[calc(100%+6px)]');
  });

  it('places the bubble below the trigger when side="bottom"', () => {
    render(
      <Tooltip label="t" side="bottom">
        <span>x</span>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip').className).toContain('top-[calc(100%+6px)]');
  });
});
