import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRoute } from './route-service';

describe('fetchRoute', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a valid OSRM response into route data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            distance: 1234,
            duration: 321,
            geometry: {
              coordinates: [[13.4, 52.5], [13.5, 52.6]],
            },
            legs: [
              {
                steps: [
                  {
                    distance: 100,
                    duration: 20,
                    name: 'Musterstrasse',
                    geometry: {
                      coordinates: [[13.4, 52.5], [13.41, 52.51]],
                    },
                    maneuver: {
                      type: 'turn',
                      modifier: 'left',
                      location: [13.4, 52.5],
                      bearing_after: 180,
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    }));

    const result = await fetchRoute(
      { lat: 52.5, lng: 13.4 },
      { lat: 52.6, lng: 13.5 },
    );

    expect(result).toEqual({
      coordinates: [[52.5, 13.4], [52.6, 13.5]],
      distanceMeters: 1234,
      durationSeconds: 321,
      steps: [
        {
          distance: 100,
          duration: 20,
          name: 'Musterstrasse',
          maneuver: {
            type: 'turn-left',
            location: { lat: 52.5, lng: 13.4 },
            bearingAfter: 180,
          },
          geometry: [[52.5, 13.4], [52.51, 13.41]],
          instruction: 'Links abbiegen auf Musterstrasse',
        },
      ],
    });
  });

  it('returns null for invalid payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ geometry: { coordinates: [] } }] }),
    }));

    await expect(fetchRoute(
      { lat: 52.5, lng: 13.4 },
      { lat: 52.6, lng: 13.5 },
    )).resolves.toBeNull();
  });
});
