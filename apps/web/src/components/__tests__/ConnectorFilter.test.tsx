// @vitest-environment jsdom

// ============================================================
// ConnectorFilter — EV charging-speed / connector-type / min-power
// selector. Fully controlled; labels come from the core taxonomy.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConnectorFilter } from '../stations/ConnectorFilter';

afterEach(() => cleanup());

const noop = () => {};

describe('ConnectorFilter', () => {
  it('renders the three charging-speed options', () => {
    render(
      <ConnectorFilter
        selectedConnectors={[]}
        onConnectorsChange={noop}
        selectedSpeeds={[]}
        onSpeedsChange={noop}
        minPowerKW={null}
        onMinPowerChange={noop}
      />,
    );
    expect(screen.getByRole('button', { name: 'AC (bis 22 kW)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DC (bis 150 kW)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'HPC (ab 150 kW)' })).toBeInTheDocument();
  });

  it('renders every connector type except the "other" catch-all', () => {
    render(
      <ConnectorFilter
        selectedConnectors={[]}
        onConnectorsChange={noop}
        selectedSpeeds={[]}
        onSpeedsChange={noop}
        minPowerKW={null}
        onMinPowerChange={noop}
      />,
    );
    expect(screen.getByRole('button', { name: /Typ 2/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CCS/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sonstiger/ })).toBeNull();
  });

  it('toggles a charging speed on and off through the callback', () => {
    const onSpeedsChange = vi.fn();
    const { rerender } = render(
      <ConnectorFilter
        selectedConnectors={[]}
        onConnectorsChange={noop}
        selectedSpeeds={[]}
        onSpeedsChange={onSpeedsChange}
        minPowerKW={null}
        onMinPowerChange={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'DC (bis 150 kW)' }));
    expect(onSpeedsChange).toHaveBeenCalledWith(['dc']);

    rerender(
      <ConnectorFilter
        selectedConnectors={[]}
        onConnectorsChange={noop}
        selectedSpeeds={['dc']}
        onSpeedsChange={onSpeedsChange}
        minPowerKW={null}
        onMinPowerChange={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'DC (bis 150 kW)' }));
    expect(onSpeedsChange).toHaveBeenLastCalledWith([]);
  });

  it('selects a connector type through the callback', () => {
    const onConnectorsChange = vi.fn();
    render(
      <ConnectorFilter
        selectedConnectors={[]}
        onConnectorsChange={onConnectorsChange}
        selectedSpeeds={[]}
        onSpeedsChange={noop}
        minPowerKW={null}
        onMinPowerChange={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Typ 2/ }));
    expect(onConnectorsChange).toHaveBeenCalledWith(['type2']);
  });

  it('picks a minimum-power threshold through the callback', () => {
    const onMinPowerChange = vi.fn();
    render(
      <ConnectorFilter
        selectedConnectors={[]}
        onConnectorsChange={noop}
        selectedSpeeds={[]}
        onSpeedsChange={noop}
        minPowerKW={null}
        onMinPowerChange={onMinPowerChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '≥50 kW' }));
    expect(onMinPowerChange).toHaveBeenCalledWith(50);
  });

  it('highlights the active speed and power selections', () => {
    render(
      <ConnectorFilter
        selectedConnectors={[]}
        onConnectorsChange={noop}
        selectedSpeeds={['ac']}
        onSpeedsChange={noop}
        minPowerKW={null}
        onMinPowerChange={noop}
      />,
    );
    expect(screen.getByRole('button', { name: 'AC (bis 22 kW)' }).className).toMatch(/bg-emerald-600/);
    // minPowerKW === null → the "Alle" option is the active one.
    expect(screen.getByRole('button', { name: 'Alle' }).className).toMatch(/bg-gray-900/);
  });
});
