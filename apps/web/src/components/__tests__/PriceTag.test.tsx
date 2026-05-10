// @vitest-environment jsdom

// ============================================================
// PriceTag — German-convention fuel-price display.
//
// Layout: integer + first decimal as the headline, second decimal
// as superscript (e.g. 1,79⁹), and the currency suffix grayed out.
// Edge: null price → centered "--" placeholder, no superscript.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PriceTag } from '../ui/PriceTag';

afterEach(() => cleanup());

describe('PriceTag', () => {
  it('renders the placeholder dashes when price is null', () => {
    const { container } = render(<PriceTag price={null} />);
    expect(container.textContent).toBe('--');
    // Sup tag should NOT be present in the null variant
    expect(container.querySelector('sup')).toBeNull();
  });

  it('renders main + superscript trailing digit + currency for a typical price', () => {
    const { container } = render(<PriceTag price={1.799} />);
    // Headline shows "1,79" (German formatting via splitPrice)
    expect(container.textContent).toMatch(/1,79/);
    // Superscript carries the third decimal "9"
    const sup = container.querySelector('sup');
    expect(sup).not.toBeNull();
    expect(sup?.textContent).toBe('9');
    // Currency suffix (€) is present
    expect(container.textContent).toMatch(/€/);
  });

  it('applies fuel-color class when fuelType is provided', () => {
    const { container } = render(<PriceTag price={1.799} fuelType="diesel" />);
    const root = container.firstElementChild;
    expect(root?.className).toMatch(/text-fuel-diesel/);
  });

  it('does NOT apply a fuel-color class when fuelType is omitted', () => {
    const { container } = render(<PriceTag price={1.799} />);
    const root = container.firstElementChild;
    expect(root?.className).not.toMatch(/text-fuel-/);
  });

  it('adds the highlight flash animation only when highlight=true', () => {
    const { container, rerender } = render(<PriceTag price={1.799} />);
    expect(container.firstElementChild?.className).not.toMatch(/animate-price-flash/);
    rerender(<PriceTag price={1.799} highlight />);
    expect(container.firstElementChild?.className).toMatch(/animate-price-flash/);
  });

  it('honours the size prop for the headline class', () => {
    const { container, rerender } = render(<PriceTag price={1.799} size="sm" />);
    const headline = container.querySelector('span > span');
    expect(headline?.className).toMatch(/text-base/);

    rerender(<PriceTag price={1.799} size="lg" />);
    const lgHeadline = container.querySelector('span > span');
    expect(lgHeadline?.className).toMatch(/text-price-main/);
  });

  it('forwards additional className to the root span', () => {
    const { container } = render(<PriceTag price={1.799} className="custom-test" />);
    expect(container.firstElementChild?.className).toMatch(/custom-test/);
  });
});
