// @vitest-environment jsdom

// ============================================================
// ManeuverIcon — SVG turn arrows keyed by ManeuverType.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ManeuverType } from '@fuelyn/core';
import { ManeuverIcon } from '../navigation/ManeuverIcon';

afterEach(() => cleanup());

describe('ManeuverIcon', () => {
  it('renders an svg with the default size class', () => {
    const { container } = render(<ManeuverIcon type="continue" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('class')).toMatch(/w-8 h-8/);
  });

  it('forwards a custom className', () => {
    const { container } = render(
      <ManeuverIcon type="turn-left" className="w-5 h-5 text-brand-600" />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toMatch(/text-brand-600/);
  });

  it('renders distinct glyphs per maneuver family', () => {
    // arrive + roundabout draw a <circle>; a plain turn does not.
    const arrive = render(<ManeuverIcon type="arrive" />);
    expect(arrive.container.querySelector('circle')).not.toBeNull();
    arrive.unmount();

    const roundabout = render(<ManeuverIcon type="roundabout" />);
    expect(roundabout.container.querySelector('circle')).not.toBeNull();
    roundabout.unmount();

    const left = render(<ManeuverIcon type="turn-left" />);
    expect(left.container.querySelector('circle')).toBeNull();
    expect(left.container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
  });

  it('renders every maneuver type without crashing', () => {
    const types: ManeuverType[] = [
      'depart', 'arrive', 'turn-left', 'turn-right', 'turn-slight-left',
      'turn-slight-right', 'turn-sharp-left', 'turn-sharp-right', 'continue',
      'merge', 'on-ramp', 'off-ramp', 'fork-left', 'fork-right', 'roundabout',
      'uturn', 'end-of-road-left', 'end-of-road-right', 'unknown',
    ];
    types.forEach((type) => {
      const { container, unmount } = render(<ManeuverIcon type={type} />);
      expect(container.querySelector('svg')).not.toBeNull();
      unmount();
    });
  });
});
